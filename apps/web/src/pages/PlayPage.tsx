import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RotateCcw, RotateCw, WifiOff } from "lucide-react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  BUILDINGS,
  GOODS,
  GOOD_INFO,
  cityInfo,
  hasBonusAt,
  placementProblem,
  plotTiles,
  type BuildableKind,
  type ClientIntent,
  type PrivateCity,
  type Projection,
  type Tile,
} from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { Button } from "@/components/ui/button";
import {
  BuildPanel,
  SpotPicker,
  TileDetails,
  type Run,
} from "@/game/play/BuildPanel";
import {
  CityPanel,
  MeetingModal,
  PhaseOverlay,
  SeasonReportModal,
} from "@/game/play/CityPanels";
import { MarketPanel, TradePanel } from "@/game/play/EconomyPanels";
import { clearSession, loadSession, type Session } from "@/game/session";
import { COIN, describeEvent, happinessFace, panel } from "@/game/format";
import { useToasts } from "@/game/hooks";
import { Stat, Toasts } from "@/game/ui";
import { useGame, type GameConnection } from "@/game/useGame";
import { cn } from "@/lib/utils";
import type { PlacementCell } from "@/world/Markers";
import { WebGLBoundary } from "@/world/WebGLBoundary";

const WorldCanvas = lazy(() =>
  import("@/world/WorldCanvas").then((module) => ({
    default: module.WorldCanvas,
  })),
);

type Tab = "build" | "market" | "trade" | "city";
const TABS: { id: Tab; label: string }[] = [
  { id: "build", label: "Build" },
  { id: "market", label: "Market" },
  { id: "trade", label: "Trade" },
  { id: "city", label: "City" },
];

function FullScreenMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <div className="max-w-sm">
        <h1 className="font-serif text-3xl tracking-tight">{title}</h1>
        <p className="mt-3 leading-7 text-muted-foreground">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </main>
  );
}

export function PlayPage() {
  const code = normalizeRoomCode(useParams().code);
  const [params] = useSearchParams();
  const seat = params.get("seat") ?? undefined;
  const session = useMemo(
    () => (code ? loadSession(code, "player", seat) : null),
    [code, seat],
  );
  if (!code || session?.role !== "player") {
    return <Navigate to={code ? `/join?code=${code}` : "/join"} replace />;
  }
  return <PlayerGame session={session} seat={seat} />;
}

function PlayerGame({
  session,
  seat,
}: {
  session: Extract<Session, { role: "player" }>;
  seat?: string;
}) {
  const auth = useMemo(
    () => ({ code: session.code, token: session.token }),
    [session],
  );
  const game = useGame(auth);

  if (game.status === "error") {
    return (
      <FullScreenMessage
        title="Can't open this game"
        body={game.error ?? "Something went wrong."}
        action={
          <Button
            asChild
            onClick={() => clearSession(session.code, "player", seat)}
          >
            <Link to={`/join?code=${session.code}`}>Join again</Link>
          </Button>
        }
      />
    );
  }
  if (game.status === "removed") {
    return (
      <FullScreenMessage
        title="You left the game"
        body="Your teacher took you out of this game. Ask them if that was a mistake."
      />
    );
  }
  if (!game.state?.myCity) {
    return (
      <FullScreenMessage
        title="Loading your city…"
        body="Connecting to the game."
      />
    );
  }
  return <PlayView game={game} state={game.state} city={game.state.myCity} />;
}

function useRun(
  game: GameConnection,
  push: ReturnType<typeof useToasts>["push"],
): Run {
  return useCallback(
    async (intent: ClientIntent, success?: string) => {
      const ack = await game.act(intent);
      if (!ack.ok) {
        push(ack.message, "bad");
        return false;
      }
      if (success) push(success, "good");
      return true;
    },
    [game, push],
  );
}

function PlayView({
  game,
  state,
  city,
}: {
  game: GameConnection;
  state: Projection;
  city: PrivateCity;
}) {
  const { toasts, push } = useToasts();
  const run = useRun(game, push);
  const [tab, setTab] = useState<Tab>("build");
  const [placing, setPlacing] = useState<BuildableKind | null>(null);
  const [hovered, setHovered] = useState<Tile | null>(null);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [reportSeen, setReportSeen] = useState(
    () => city.lastReport?.season ?? 0,
  );

  // Toast new events, but not the backlog sent when we (re)connect.
  const lastSeq = useRef<number | null>(null);
  useEffect(() => {
    const newest = game.events.at(-1)?.seq ?? 0;
    if (lastSeq.current !== null) {
      for (const event of game.events) {
        if (event.seq <= lastSeq.current) continue;
        const message = describeEvent(event);
        if (message) push(message.text, message.tone);
      }
    }
    lastSeq.current = newest;
  }, [game.events, push]);

  // Other cities' offers to us don't come as events; spot them in the state.
  const knownOffers = useRef<Set<string> | null>(null);
  useEffect(() => {
    const incoming = state.offers.filter(
      (o) => o.to === city.id && o.status === "open",
    );
    if (knownOffers.current) {
      for (const offer of incoming) {
        if (!knownOffers.current.has(offer.id)) {
          const from = state.cities.find((c) => c.id === offer.from)?.name;
          push(
            `📦 ${from} sent you a trade offer. Check the Trade tab.`,
            "info",
          );
        }
      }
    }
    knownOffers.current = new Set(state.offers.map((o) => o.id));
  }, [state.offers, state.cities, city.id, push]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === "Escape") {
        setPlacing(null);
        setSelected(null);
      } else if (event.key === "q" || event.key === "Q") {
        setQuarterTurns((turns) => turns - 1);
      } else if (event.key === "e" || event.key === "E") {
        setQuarterTurns((turns) => turns + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const placementCells = useMemo<PlacementCell[] | undefined>(
    () =>
      placing
        ? plotTiles(cityInfo(city.id)).map(({ x, y }) => ({
            x,
            y,
            ok: placementProblem(city, placing, x, y) === null,
          }))
        : undefined,
    [placing, city],
  );

  async function handleTileClick(tile: Tile) {
    if (!placing) {
      setSelected(tile);
      return;
    }
    const problem = placementProblem(city, placing, tile.x, tile.y);
    if (problem) {
      push(problem.message, "bad");
      return;
    }
    const kind = placing;
    const built = await run(
      { type: "build", payload: { kind, x: tile.x, y: tile.y } },
      hasBonusAt(kind, tile.x, tile.y)
        ? `${BUILDINGS[kind].name} built, with a bonus! ✨`
        : `${BUILDINGS[kind].name} built!`,
    );
    if (built) {
      setPlacing(null);
      setSelected(tile);
    }
  }

  const hint = placing
    ? hovered
      ? (placementProblem(city, placing, hovered.x, hovered.y)?.message ??
        (hasBonusAt(placing, hovered.x, hovered.y)
          ? `Tap to build here. ${BUILDINGS[placing].bonus?.text}`
          : `Tap to build your ${BUILDINGS[placing].name} here.`))
      : `Tap a green tile to build your ${BUILDINGS[placing].name}. Esc to cancel.`
    : null;

  const report =
    city.lastReport && city.lastReport.season > reportSeen
      ? city.lastReport
      : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[linear-gradient(180deg,#e7f0ea_0%,#f6f5ee_55%,#ede3d1_100%)]">
      <div
        className={cn(
          "absolute inset-y-0 left-0 right-[19rem] lg:right-[22rem]",
          placing && "cursor-crosshair",
        )}
      >
        <WebGLBoundary
          fallback={
            <p className="grid h-full place-items-center p-6 text-center text-muted-foreground">
              This device can't show the 3D city. You can still play with the
              panels.
            </p>
          }
        >
          <Suspense fallback={null}>
            <WorldCanvas
              mode="interactive"
              cities={state.cities}
              commons={state.commons}
              tick={state.tick}
              myCityId={city.id}
              hovered={hovered}
              selected={selected}
              placementCells={placementCells}
              quarterTurns={quarterTurns}
              onTileHover={setHovered}
              onTileClick={handleTileClick}
            />
          </Suspense>
        </WebGLBoundary>

        <header className="pointer-events-none absolute inset-x-0 top-0 p-3">
          <div
            className={cn(
              panel,
              "pointer-events-auto inline-flex max-w-full flex-col gap-2 p-3",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ background: city.color }}
                />
                <span className="font-serif text-xl tracking-tight">
                  {city.name}
                </span>
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                Season {state.season} · Day {state.tick}
                {state.speed > 1 ? ` · ×${state.speed}` : ""}
              </span>
              {state.events.length ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                  {state.events
                    .map((e) =>
                      e.kind === "drought"
                        ? "☀️ Drought"
                        : e.kind === "festival"
                          ? "🎉 Festival"
                          : "🌊 Flood",
                    )
                    .join(" · ")}
                </span>
              ) : null}
              {game.status === "reconnecting" ? (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                  <WifiOff className="size-3" aria-hidden="true" />{" "}
                  Reconnecting…
                </span>
              ) : null}
            </div>
            <div
              className="flex flex-wrap gap-1.5 text-sm"
              aria-label="Your city's stats"
            >
              <Stat
                icon={COIN}
                label="Coins"
                value={city.coins}
                rate={city.income.coins}
              />
              {GOODS.map((good) => (
                <Stat
                  key={good}
                  icon={GOOD_INFO[good].icon}
                  label={GOOD_INFO[good].name}
                  value={city.goods[good]}
                  rate={city.income[good]}
                />
              ))}
              <Stat
                icon="👥"
                label="People / homes"
                value={city.population}
                max={city.housing}
              />
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setTab("city");
                }}
                className="rounded-lg"
              >
                <Stat
                  icon={happinessFace(city.happiness)}
                  label="Happiness (tap for why)"
                  value={city.happiness}
                />
              </button>
              <Stat
                icon="🏭"
                label="Pollution"
                value={city.pollution}
                className={
                  city.pollution >= 8 ? "bg-destructive/10" : undefined
                }
              />
            </div>
          </div>
        </header>

        {hint ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-16 mx-auto w-fit max-w-[90%] rounded-full bg-foreground/85 px-4 py-2 text-center text-sm font-semibold text-background shadow-lg">
            {hint}
          </p>
        ) : null}

        <div
          className={cn(
            panel,
            "absolute bottom-3 left-3 flex items-center gap-1 p-1",
          )}
        >
          <Button
            variant="ghost"
            className="size-9 p-0"
            onClick={() => setQuarterTurns((t) => t - 1)}
            aria-label="Turn map left (Q)"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            className="size-9 p-0"
            onClick={() => setQuarterTurns((t) => t + 1)}
            aria-label="Turn map right (E)"
          >
            <RotateCw className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <PhaseOverlay game={state} city={city} />
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[19rem] flex-col border-l bg-card lg:w-[22rem]">
        {selected ? (
          <div className="overflow-y-auto p-4">
            <TileDetails
              tile={selected}
              game={state}
              city={city}
              run={run}
              onClose={() => setSelected(null)}
            />
          </div>
        ) : (
          <>
            <nav
              className="grid grid-cols-4 gap-1 border-b p-2"
              role="tablist"
              aria-label="Panels"
            >
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative rounded-md py-2 text-sm font-bold",
                    tab === id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary",
                  )}
                >
                  {label}
                  {id === "trade" &&
                  state.offers.some(
                    (o) => o.to === city.id && o.status === "open",
                  ) ? (
                    <span
                      className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--orange)]"
                      aria-label="New offers"
                    />
                  ) : null}
                </button>
              ))}
            </nav>
            <div className="flex-1 overflow-y-auto p-3" role="tabpanel">
              {tab === "build" ? (
                <>
                  {placing ? (
                    <SpotPicker
                      city={city}
                      kind={placing}
                      onPlace={handleTileClick}
                    />
                  ) : null}
                  <BuildPanel
                    city={city}
                    placing={placing}
                    onPick={(kind) => {
                      setPlacing(kind);
                      setSelected(null);
                    }}
                  />
                </>
              ) : tab === "market" ? (
                <MarketPanel game={state} city={city} run={run} />
              ) : tab === "trade" ? (
                <TradePanel game={state} city={city} run={run} />
              ) : (
                <CityPanel game={state} city={city} />
              )}
            </div>
          </>
        )}
      </aside>

      {state.phase === "meeting" ? (
        <MeetingModal game={state} city={city} run={run} />
      ) : null}
      {report && state.phase !== "meeting" ? (
        <SeasonReportModal
          report={report}
          game={state}
          onClose={() => setReportSeen(report.season)}
        />
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}
