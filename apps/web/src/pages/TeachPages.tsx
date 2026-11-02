import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { ExternalLink, LoaderCircle, Pause, Play, Square } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  EVENTS,
  GOODS,
  GOOD_INFO,
  POLICIES,
  SPEEDS,
  type CityId,
  type ClientIntent,
  type EventKind,
  type PolicyId,
  type Projection,
} from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { Button } from "@/components/ui/button";
import { createGame } from "@/game/api";
import { Leaderboards, NatureHealth } from "@/game/play/CityPanels";
import { loadSession, saveSession } from "@/game/session";
import { COIN, describeEvent, happinessFace, panel } from "@/game/format";
import { useToasts } from "@/game/hooks";
import { Section, Toasts } from "@/game/ui";
import { useGame, type GameConnection } from "@/game/useGame";
import { cn } from "@/lib/utils";
import { WebGLBoundary } from "@/world/WebGLBoundary";

const WorldCanvas = lazy(() =>
  import("@/world/WorldCanvas").then((module) => ({
    default: module.WorldCanvas,
  })),
);

export function TeachHomePage() {
  const navigate = useNavigate();
  const [cities, setCities] = useState(5);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const game = await createGame(cities);
      saveSession({
        role: "teacher",
        code: game.code,
        token: game.teacherToken,
      });
      navigate(`/teach/${game.code}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Couldn't create a game.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
        Teacher console
      </p>
      <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em]">
        Start a class game.
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">
        Students join with a code, get sorted into cities, and build together.
        You run the seasons, the Town Meetings and the surprises.
      </p>
      <form
        onSubmit={handleSubmit}
        className={cn(panel, "mt-10 space-y-5 p-6 shadow-sm")}
      >
        <fieldset>
          <legend className="text-sm font-semibold">How many cities?</legend>
          <p className="mt-1 text-xs text-muted-foreground">
            Aim for 3 to 6 students per city.
          </p>
          <div className="mt-3 flex gap-2" role="radiogroup">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={cities === n}
                onClick={() => setCities(n)}
                className={cn(
                  "h-11 w-14 rounded-lg border text-lg font-bold",
                  cities === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-secondary",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={creating}>
          {creating ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Create game
        </Button>
      </form>
    </div>
  );
}

export function TeacherConsolePage() {
  const code = normalizeRoomCode(useParams().code) ?? "";
  const session = useMemo(
    () => (code ? loadSession(code, "teacher") : null),
    [code],
  );
  const auth = useMemo(
    () => (session ? { code, token: session.token } : null),
    [code, session],
  );
  const game = useGame(auth);

  if (!session) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-serif text-3xl tracking-tight">
            This isn't your game on this device
          </h1>
          <p className="mt-3 text-muted-foreground">
            Open the console from the browser you created the game on, or start
            a new game.
          </p>
          <Button asChild className="mt-6">
            <Link to="/teach">Start a new game</Link>
          </Button>
        </div>
      </main>
    );
  }
  if (game.status === "error") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="max-w-sm text-muted-foreground">{game.error}</p>
      </main>
    );
  }
  if (!game.state) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground">
        Connecting…
      </main>
    );
  }
  return <Console code={code} game={game} state={game.state} />;
}

function Console({
  code,
  game,
  state,
}: {
  code: string;
  game: GameConnection;
  state: Projection;
}) {
  const { toasts, push } = useToasts();
  const [policies, setPolicies] = useState<PolicyId[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const joinUrl = `${window.location.origin}/join?code=${code}`;

  async function run(intent: ClientIntent) {
    const ack = await game.act(intent);
    if (!ack.ok) push(ack.message, "bad");
    return ack.ok;
  }

  const recent = game.events
    .filter((event) => event.outcome === "accepted")
    .slice(-8)
    .reverse();
  const players = state.roster ?? [];

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b bg-card px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Join code
          </p>
          <p
            className="font-mono text-4xl font-black tracking-[0.15em]"
            data-testid="join-code"
          >
            {code}
          </p>
        </div>
        <div className="text-sm">
          <p className="text-muted-foreground">
            Students go to{" "}
            <span className="font-semibold text-foreground">
              {joinUrl.replace(/^https?:\/\//, "")}
            </span>
          </p>
          <p className="mt-1">
            <span className="font-semibold">{players.length}</span> students ·
            Season {state.season} · Day {state.tick} ·{" "}
            <span className="font-semibold capitalize">{state.phase}</span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {state.phase === "lobby" ? (
            <Button onClick={() => run({ type: "start" })}>
              <Play className="size-4" aria-hidden="true" /> Start game
            </Button>
          ) : state.phase === "running" ? (
            <Button variant="outline" onClick={() => run({ type: "pause" })}>
              <Pause className="size-4" aria-hidden="true" /> Pause
            </Button>
          ) : state.phase === "paused" ? (
            <Button onClick={() => run({ type: "resume" })}>
              <Play className="size-4" aria-hidden="true" /> Resume
            </Button>
          ) : null}
          <div
            className="flex rounded-lg border p-0.5"
            role="radiogroup"
            aria-label="Speed"
          >
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                role="radio"
                aria-checked={state.speed === speed}
                onClick={() => run({ type: "setSpeed", payload: { speed } })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm font-bold",
                  state.speed === speed
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary",
                )}
              >
                ×{speed}
              </button>
            ))}
          </div>
          <Button asChild variant="ghost">
            <a href={`/projector/${code}`} target="_blank" rel="noreferrer">
              Projector <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={`/debug/${code}`} target="_blank" rel="noreferrer">
              Debug
            </a>
          </Button>
          {state.phase !== "ended" ? (
            <Button
              variant="outline"
              className={cn(
                confirmEnd && "border-destructive text-destructive",
              )}
              onClick={async () => {
                if (!confirmEnd) return setConfirmEnd(true);
                await run({ type: "end" });
              }}
              onBlur={() => setConfirmEnd(false)}
            >
              <Square className="size-4" aria-hidden="true" />{" "}
              {confirmEnd ? "Click again to end" : "End game"}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 p-5 xl:grid-cols-[1fr_26rem]">
        <div className="space-y-5">
          <section className={cn(panel, "overflow-x-auto p-4 shadow-sm")}>
            <h2 className="mb-3 font-bold">Cities</h2>
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-semibold">City</th>
                  <th className="pb-2 font-semibold">Students</th>
                  <th className="pb-2 text-right font-semibold">People</th>
                  <th className="pb-2 text-right font-semibold">Happy</th>
                  <th className="pb-2 text-right font-semibold">Pollution</th>
                  <th className="pb-2 text-right font-semibold">{COIN}</th>
                  {GOODS.map((good) => (
                    <th
                      key={good}
                      className="pb-2 text-right font-semibold"
                      title={GOOD_INFO[good].name}
                    >
                      {GOOD_INFO[good].icon}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-semibold">Buildings</th>
                </tr>
              </thead>
              <tbody>
                {(state.allCities ?? []).map((city) => (
                  <tr key={city.id} className="border-t align-top">
                    <td className="py-2 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: city.color }}
                        />
                        {city.name}
                      </span>
                    </td>
                    <td className="py-2">
                      <ul className="space-y-1">
                        {players
                          .filter((p) => p.cityId === city.id)
                          .map((player) => (
                            <li
                              key={player.playerId}
                              className="flex items-center gap-1"
                            >
                              <span className="min-w-0 truncate">
                                {player.name}
                              </span>
                              <select
                                aria-label={`Move ${player.name}`}
                                value={player.cityId}
                                onChange={async (event) => {
                                  const ack = await game.admin({
                                    type: "movePlayer",
                                    playerId: player.playerId,
                                    cityId: event.target.value as CityId,
                                  });
                                  if (!ack.ok) push(ack.message, "bad");
                                }}
                                className="ml-auto h-6 rounded border bg-background text-xs"
                              >
                                {(state.allCities ?? []).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name.replace(" City", "")}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="rounded px-1 text-xs text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${player.name}`}
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Remove ${player.name} from the game?`,
                                    )
                                  )
                                    return;
                                  await game.admin({
                                    type: "removePlayer",
                                    playerId: player.playerId,
                                  });
                                }}
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                      </ul>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {city.population}/{city.housing}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {happinessFace(city.happiness)}{" "}
                      {Math.round(city.happiness)}
                    </td>
                    <td
                      className={cn(
                        "py-2 text-right tabular-nums",
                        city.pollution >= 8 && "font-bold text-destructive",
                      )}
                    >
                      {city.pollution}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.floor(city.coins)}
                    </td>
                    {GOODS.map((good) => (
                      <td key={good} className="py-2 text-right tabular-nums">
                        {Math.floor(city.goods[good])}
                      </td>
                    ))}
                    <td className="py-2 text-right tabular-nums">
                      {city.buildings.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section
            className={cn(panel, "h-[26rem] overflow-hidden shadow-sm")}
            aria-label="Map"
          >
            <WebGLBoundary>
              <Suspense fallback={null}>
                <WorldCanvas
                  mode="interactive"
                  cities={state.cities}
                  commons={state.commons}
                  tick={state.tick}
                />
              </Suspense>
            </WebGLBoundary>
          </section>
        </div>

        <div className="space-y-5">
          <section className={cn(panel, "space-y-3 p-4 shadow-sm")}>
            <h2 className="font-bold">Town Meeting</h2>
            {state.meeting ? (
              <>
                <ul className="space-y-2 text-sm">
                  {state.meeting.policyIds.map((id) => {
                    const votes = Object.values(state.meeting?.votes ?? {}).map(
                      (v) => v?.[id],
                    );
                    return (
                      <li key={id} className="rounded-lg border p-2">
                        <p className="font-semibold">{POLICIES[id].name}</p>
                        <p className="text-xs text-muted-foreground">
                          👍 {votes.filter((v) => v === true).length} · 👎{" "}
                          {votes.filter((v) => v === false).length}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {state.meeting.votedCities.length} of {state.cities.length}{" "}
                  cities have voted.
                </p>
                <Button
                  className="w-full"
                  onClick={() => run({ type: "closeMeeting" })}
                >
                  Close voting and end season {state.season}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Pick 1–3 rules for cities to vote on. Production stops while
                  they decide.
                </p>
                <ul className="space-y-1.5">
                  {state.availablePolicies.map((id) => (
                    <li key={id}>
                      <label className="flex gap-2 rounded-lg border p-2 text-sm">
                        <input
                          type="checkbox"
                          checked={policies.includes(id)}
                          disabled={
                            !policies.includes(id) && policies.length >= 3
                          }
                          onChange={(event) =>
                            setPolicies((current) =>
                              event.target.checked
                                ? [...current, id]
                                : current.filter((p) => p !== id),
                            )
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-semibold">
                            {POLICIES[id].name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {POLICIES[id].summary}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  disabled={
                    !policies.length ||
                    (state.phase !== "running" && state.phase !== "paused")
                  }
                  onClick={async () => {
                    if (
                      await run({
                        type: "startMeeting",
                        payload: { policyIds: policies },
                      })
                    )
                      setPolicies([]);
                  }}
                >
                  Call a Town Meeting
                </Button>
              </>
            )}
          </section>

          <section className={cn(panel, "space-y-2 p-4 shadow-sm")}>
            <h2 className="font-bold">Surprise events</h2>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(EVENTS) as EventKind[]).map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  className="h-auto flex-col py-2"
                  disabled={
                    state.phase !== "running" && state.phase !== "paused"
                  }
                  title={EVENTS[kind].summary}
                  onClick={() =>
                    run({ type: "triggerEvent", payload: { kind } })
                  }
                >
                  <span aria-hidden="true">
                    {kind === "drought"
                      ? "☀️"
                      : kind === "festival"
                        ? "🎉"
                        : "🌊"}
                  </span>
                  {EVENTS[kind].name}
                </Button>
              ))}
            </div>
          </section>

          <section className={cn(panel, "p-4 shadow-sm")}>
            <Section title="Nature everyone shares">
              <NatureHealth game={state} />
            </Section>
          </section>

          <section className={cn(panel, "p-4 shadow-sm")}>
            <Section title="Leaderboards">
              <Leaderboards game={state} />
            </Section>
          </section>

          <section className={cn(panel, "p-4 shadow-sm")}>
            <Section title="What just happened">
              <ul className="space-y-1 text-xs">
                {recent.map((event) => (
                  <li key={event.seq} className="flex gap-2">
                    <span className="text-muted-foreground">
                      day {event.tick}
                    </span>
                    <span>
                      {event.city
                        ? `${state.cities.find((c) => c.id === event.city)?.name}: `
                        : ""}
                      {describeEvent(event)?.text ??
                        event.type.replace(/[._]/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </section>
        </div>
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
}
