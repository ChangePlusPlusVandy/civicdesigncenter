import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Axe,
  Fish,
  Gem,
  Pickaxe,
  RotateCcw,
  RotateCw,
  Tent,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CITIES,
  PRODUCTION,
  PRODUCTION_KINDS,
  TILE_LABELS,
  cityAt,
  createDemoBuildings,
  hasBonus,
  isProduction,
  placementProblem,
  riverMurk,
  type City,
  type PlacedBuilding,
  type ProductionKind,
  type Tile,
  type TileKind,
} from "@/world/map";
import type { PlacementCell } from "@/world/Markers";
import { WebGLBoundary } from "@/world/WorldBackdrop";
import { WorldCanvas } from "@/world/WorldCanvas";

// The prototype plays as Green City: it borders the river and the east woods,
// so every kind of rule shows up on its land.
const PLAYER = CITIES.find((city) => city.id === "green") as City;

const ICONS: Record<ProductionKind, LucideIcon> = {
  farm: Wheat,
  "lumber-camp": Axe,
  "fishing-camp": Fish,
  "hunting-camp": Tent,
  "clay-mine": Pickaxe,
  "copper-mine": Gem,
};

const TILE_INFO: Record<TileKind, string> = {
  grass: "Open land. Nothing is built here yet.",
  woods:
    "Lumber and animals live here. Lumber and hunting camps must be built right next to woods.",
  water:
    "Fish live in the river. Fishing camps must touch it. Pollution from the cities on its banks makes it murky.",
  clay: "A clay deposit. A clay mine next to it makes more clay and less pollution.",
  copper:
    "A copper deposit. A copper mine next to it makes more copper and less pollution.",
};

const DEMO_STATS = [
  { label: "Lumber", value: 7 },
  { label: "Clay", value: 9 },
  { label: "Copper", value: 3 },
  { label: "Food", value: 6 },
];

type Notice = { text: string; tone: "good" | "bad" };

function plotCells(city: City) {
  const { x, y, width, height } = city.plot;
  return Array.from({ length: width * height }, (_, i) => ({
    x: x + (i % width),
    y: y + Math.floor(i / width),
  }));
}

function NoWebGL() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      <p className="max-w-sm text-muted-foreground">
        This device can’t show the 3D world. Try a newer browser, or turn on
        hardware acceleration.
      </p>
    </div>
  );
}

function TileDetails({
  tile,
  building,
  murk,
  onToggle,
  onClose,
}: {
  tile: Tile;
  building?: PlacedBuilding;
  murk: number;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const owner = cityAt(tile.x, tile.y);
  const production =
    building && isProduction(building.kind) ? PRODUCTION[building.kind] : null;
  const title = production
    ? production.name
    : building?.kind === "hall"
      ? "Town Hall"
      : building?.kind === "house"
        ? "Homes"
        : TILE_LABELS[tile.kind];

  let description = TILE_INFO[tile.kind];
  if (production) {
    description = production.summary;
  } else if (building?.kind === "hall") {
    description = `The heart of ${owner?.name ?? "the city"}. Its flag marks whose land this is.`;
  } else if (building?.kind === "house") {
    description =
      "Homes for the city's people. Every running building needs one worker, so more people means more buildings can run.";
  } else if (tile.kind === "grass" && owner?.id === PLAYER.id) {
    description =
      "Open land in your city. Pick a building below to build here.";
  } else if (tile.kind === "grass" && !owner) {
    description = "Open land that no city owns yet.";
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {owner ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ background: owner.color }}
              />
              {owner.id === PLAYER.id ? "Your city" : owner.name}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          className="size-8 p-0"
          onClick={onClose}
          aria-label="Close tile details"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {tile.kind === "water" ? (
        <p className="mt-2 text-sm font-semibold">
          Murkiness: {Math.round(murk * 100)}%
        </p>
      ) : null}
      {production?.bonus && building ? (
        <p
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-sm",
            hasBonus(building.kind as ProductionKind, building.x, building.y)
              ? "bg-primary/10 font-semibold text-primary"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {hasBonus(building.kind as ProductionKind, building.x, building.y)
            ? "Bonus active: "
            : "Possible bonus: "}
          {production.bonus}
        </p>
      ) : null}
      {production && building ? (
        owner?.id === PLAYER.id ? (
          <Button
            className="mt-4 w-full"
            variant={building.running ? "outline" : "default"}
            onClick={() => onToggle(building.id)}
          >
            {building.running
              ? "Running · tap to stop"
              : "Stopped · tap to run"}
          </Button>
        ) : (
          <p className="mt-4 text-sm font-semibold">
            {building.running ? "Running" : "Stopped"}
          </p>
        )
      ) : null}
    </div>
  );
}

export function WorldPrototypePage() {
  const [buildings, setBuildings] =
    useState<PlacedBuilding[]>(createDemoBuildings);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<Tile | null>(null);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [placing, setPlacing] = useState<ProductionKind | null>(null);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pollution, setPollution] = useState<Record<string, number>>({
    red: 5,
    green: 4,
    pink: 8,
    blue: 4,
    yellow: 2,
  });

  const placementCells = useMemo<PlacementCell[] | undefined>(
    () =>
      placing
        ? plotCells(PLAYER).map(({ x, y }) => ({
            x,
            y,
            ok: placementProblem(placing, x, y, PLAYER.id, buildings) === null,
          }))
        : undefined,
    [placing, buildings],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPlacing(null);
        setSelected(null);
        setNotice(null);
      } else if (event.key === "q" || event.key === "Q") {
        setQuarterTurns((turns) => turns - 1);
      } else if (event.key === "e" || event.key === "E") {
        setQuarterTurns((turns) => turns + 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function handleTileClick(tile: Tile) {
    if (!placing) {
      setSelected(tile);
      setNotice(null);
      return;
    }

    const problem = placementProblem(
      placing,
      tile.x,
      tile.y,
      PLAYER.id,
      buildings,
    );
    if (problem) {
      setNotice({ text: problem, tone: "bad" });
      return;
    }

    const building: PlacedBuilding = {
      id: `${PLAYER.id}-${placing}-${tile.x}-${tile.y}-${Date.now()}`,
      kind: placing,
      cityId: PLAYER.id,
      x: tile.x,
      y: tile.y,
      running: true,
    };
    setBuildings((current) => [...current, building]);
    setFreshIds((current) => new Set(current).add(building.id));
    setPlacing(null);
    setSelected(tile);
    setNotice({
      text: hasBonus(placing, tile.x, tile.y)
        ? `${PRODUCTION[placing].name} built, with a bonus!`
        : `${PRODUCTION[placing].name} built!`,
      tone: "good",
    });
  }

  function toggleRunning(id: string) {
    setBuildings((current) =>
      current.map((building) =>
        building.id === id
          ? { ...building, running: !building.running }
          : building,
      ),
    );
  }

  function choose(kind: ProductionKind) {
    setPlacing((current) => (current === kind ? null : kind));
    setNotice(null);
  }

  const hoverProblem =
    placing && hovered
      ? placementProblem(placing, hovered.x, hovered.y, PLAYER.id, buildings)
      : null;
  // Touchscreens never hover, so a tapped tile's problem (in `notice`) still
  // shows until the pointer moves to another tile.
  const status: Notice | null = placing
    ? hoverProblem
      ? { text: hoverProblem, tone: "bad" }
      : (notice ?? {
          text:
            hovered && hasBonus(placing, hovered.x, hovered.y)
              ? `Click to build here. Bonus: ${PRODUCTION[placing].bonus}`
              : `Place your ${PRODUCTION[placing].name} on a green tile. Esc to cancel.`,
          tone: "good",
        })
    : notice;

  function handleTileHover(tile: Tile | null) {
    if (tile !== hovered && placing) setNotice(null);
    setHovered(tile);
  }

  const selectedBuilding = selected
    ? buildings.find(({ x, y }) => x === selected.x && y === selected.y)
    : undefined;
  const murk = riverMurk(pollution);
  const playerPollution = pollution[PLAYER.id] ?? 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[linear-gradient(180deg,#e7f0ea_0%,#f6f5ee_55%,#ede3d1_100%)]">
      <WebGLBoundary fallback={<NoWebGL />}>
        <div className={cn("absolute inset-0", placing && "cursor-crosshair")}>
          <WorldCanvas
            mode="interactive"
            buildings={buildings}
            pollution={pollution}
            freshIds={freshIds}
            hovered={hovered}
            selected={selected}
            placementCells={placementCells}
            quarterTurns={quarterTurns}
            onTileHover={handleTileHover}
            onTileClick={handleTileClick}
          />
        </div>
      </WebGLBoundary>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <section className="pointer-events-auto w-72 rounded-xl border bg-card/90 p-4 shadow-lg backdrop-blur-md">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> City Settlers
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="size-3 rounded-full"
              style={{ background: PLAYER.color }}
            />
            <h1 className="font-serif text-2xl tracking-tight">
              {PLAYER.name}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            3D world prototype · demo numbers
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "People", value: 7 },
              { label: "Happiness", value: 5 },
              { label: "Pollution", value: playerPollution },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-secondary px-2 py-1.5">
                <dt className="text-[11px] font-semibold text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-lg font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <dl className="mt-2 grid grid-cols-4 gap-1 text-center">
            {DEMO_STATS.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside
          className="pointer-events-auto w-80 rounded-xl border bg-card/90 p-4 shadow-lg backdrop-blur-md"
          aria-live="polite"
        >
          {selected ? (
            <TileDetails
              tile={selected}
              building={selectedBuilding}
              murk={murk}
              onToggle={toggleRunning}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                Explore the map
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Tap any tile to learn about it. Your land has the green fence.
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>Drag to move · scroll or pinch to zoom</li>
                <li>Q / E or the arrows to turn the map</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4">
        {status ? (
          <p
            role="status"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-md",
              status.tone === "good"
                ? "bg-primary/90 text-primary-foreground"
                : "bg-destructive/90 text-white",
            )}
          >
            {status.text}
          </p>
        ) : null}
        <div
          role="toolbar"
          aria-label="Build"
          className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-xl border bg-card/90 p-1.5 shadow-lg backdrop-blur-md"
        >
          {PRODUCTION_KINDS.map((kind) => {
            const Icon = ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={placing === kind}
                onClick={() => choose(kind)}
                className={cn(
                  "flex w-[5.5rem] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  placing === kind
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {PRODUCTION[kind].name}
              </button>
            );
          })}
        </div>
      </div>

      <section className="absolute right-4 bottom-28 w-56 rounded-xl border bg-card/90 p-3 shadow-lg backdrop-blur-md xl:bottom-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            Turn map
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              className="size-8 p-0"
              onClick={() => setQuarterTurns((turns) => turns - 1)}
              aria-label="Turn map left (Q)"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              className="size-8 p-0"
              onClick={() => setQuarterTurns((turns) => turns + 1)}
              aria-label="Turn map right (E)"
            >
              <RotateCw className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <label
          htmlFor="pollution"
          className="mt-3 block text-xs font-semibold text-muted-foreground"
        >
          Demo: {PLAYER.name} pollution ({playerPollution})
        </label>
        <input
          id="pollution"
          type="range"
          min={0}
          max={20}
          value={playerPollution}
          onChange={(event) =>
            setPollution((current) => ({
              ...current,
              [PLAYER.id]: Number(event.target.value),
            }))
          }
          className="mt-1 w-full accent-[var(--primary)]"
        />
      </section>
    </div>
  );
}
