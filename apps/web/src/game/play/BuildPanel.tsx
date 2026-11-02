import { useState } from "react";
import { X } from "lucide-react";
import {
  BUILDABLE,
  BUILDINGS,
  GOOD_INFO,
  MAX_LEVEL,
  TILE_NAMES,
  canAfford,
  cityAt,
  cityInfo,
  hasBonusAt,
  placementProblem,
  plotTiles,
  upgradeCost,
  type BuildableKind,
  type Building,
  type ClientIntent,
  type Good,
  type PrivateCity,
  type Projection,
  type Tile,
} from "@cs/idle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CostChips } from "../ui";

export type Run = (intent: ClientIntent, success?: string) => Promise<boolean>;

const TILE_INFO: Record<Tile["kind"], string> = {
  grass: "Open land.",
  woods:
    "Wood and animals live here. Lumber camps and hunting lodges must be built right next to woods.",
  water:
    "Fish live in the river. Fishing docks must touch it. Pollution from the cities on its banks makes it murky.",
  clay: "A clay deposit. A clay pit next to it digs more clay and pollutes less.",
  copper:
    "A copper deposit. A copper mine next to it makes more copper and pollutes less.",
};

const STATUS_TEXT: Record<Building["status"], string> = {
  ok: "Working",
  stopped: "Stopped",
  "no-workers": "Not enough workers. Grow your city to run it.",
  "commons-empty": "There's nothing left to take nearby. Let it grow back.",
};

// The player's plot as a grid of buttons: another way to place a building
// that works with a keyboard or screen reader, next to tapping the 3D map.
export function SpotPicker({
  city,
  kind,
  onPlace,
}: {
  city: PrivateCity;
  kind: BuildableKind;
  onPlace: (tile: Tile) => void;
}) {
  const { plot } = cityInfo(city.id);
  return (
    <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-2.5">
      <p className="text-sm font-semibold">
        Where should the {BUILDINGS[kind].name} go?
      </p>
      <p className="text-xs text-muted-foreground">
        Tap a green spot here or on the map. ✨ means a bonus.
      </p>
      <div
        className="mx-auto mt-2 grid w-fit gap-1"
        style={{ gridTemplateColumns: `repeat(${plot.width}, 2.5rem)` }}
      >
        {plotTiles(cityInfo(city.id)).map((tile) => {
          const building = city.buildings.find(
            (b) => b.x === tile.x && b.y === tile.y,
          );
          const problem = placementProblem(city, kind, tile.x, tile.y);
          const row = tile.y - plot.y + 1;
          const column = tile.x - plot.x + 1;
          return (
            <button
              key={`${tile.x}-${tile.y}`}
              type="button"
              disabled={problem !== null}
              onClick={() => onPlace(tile)}
              title={problem?.message}
              aria-label={
                problem
                  ? `Row ${row}, column ${column}: ${problem.message}`
                  : `Build here: row ${row}, column ${column}${hasBonusAt(kind, tile.x, tile.y) ? ", with a bonus" : ""}`
              }
              className={cn(
                "grid size-10 place-items-center rounded-md text-base",
                problem
                  ? "bg-secondary text-muted-foreground"
                  : "bg-primary/80 text-primary-foreground hover:bg-primary",
              )}
            >
              {building
                ? BUILDINGS[building.kind].icon
                : !problem && hasBonusAt(kind, tile.x, tile.y)
                  ? "✨"
                  : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BuildPanel({
  city,
  placing,
  onPick,
}: {
  city: PrivateCity;
  placing: BuildableKind | null;
  onPick: (kind: BuildableKind | null) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {BUILDABLE.map((kind) => {
        const def = BUILDINGS[kind];
        const affordable = canAfford(city, def.cost);
        const active = placing === kind;
        return (
          <li key={kind}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? null : kind)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/10" : "hover:bg-secondary",
                !affordable && !active && "opacity-60",
              )}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {def.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold">{def.name}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {def.blurb}
                </span>
                <span className="mt-1.5 block">
                  <CostChips cost={def.cost} have={city} />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function made(building: Building): string {
  const gains = (
    Object.entries(building.lastOutput) as [Good, number][]
  ).filter(([, n]) => n > 0);
  return gains.length
    ? gains
        .map(
          ([good, n]) => `${Math.round(n * 10) / 10} ${GOOD_INFO[good].icon}`,
        )
        .join(", ")
    : "nothing";
}

export function TileDetails({
  tile,
  game,
  city,
  run,
  onClose,
}: {
  tile: Tile;
  game: Projection;
  city: PrivateCity;
  run: Run;
  onClose: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const owner = cityAt(tile.x, tile.y);
  const ownerCity = owner
    ? game.cities.find((c) => c.id === owner.id)
    : undefined;
  const building = ownerCity?.buildings.find(
    (b) => b.x === tile.x && b.y === tile.y,
  );
  const mine = owner?.id === city.id;
  const def = building ? BUILDINGS[building.kind] : undefined;
  const commons = tile.commons
    ? game.commons.find((c) => c.id === tile.commons)
    : undefined;

  let title: string = TILE_NAMES[tile.kind];
  if (def) title = def.name;
  else if (mine) title = "Your land";

  const bonusOn = building
    ? hasBonusAt(building.kind, building.x, building.y)
    : false;
  const next =
    building && building.kind !== "hall" && building.level < MAX_LEVEL
      ? upgradeCost(building.kind, building.level + 1)
      : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            {def ? <span aria-hidden="true">{def.icon}</span> : null}
            {title}
            {building && building.kind !== "hall" ? (
              <span
                className="text-sm text-[var(--orange)]"
                aria-label={`Level ${building.level}`}
              >
                {"★".repeat(building.level)}
              </span>
            ) : null}
          </h2>
          {ownerCity ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ background: ownerCity.color }}
              />
              {mine ? "Your city" : ownerCity.name}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          className="size-8 p-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {def
          ? def.blurb
          : mine
            ? "Open land in your city. Pick a building to build here."
            : TILE_INFO[tile.kind]}
      </p>

      {commons ? (
        <p className="mt-2 text-sm font-semibold">
          {commons.name} health: {commons.health}%
          {commons.collapsed ? " · used up!" : ""}
        </p>
      ) : null}

      {building && def?.workers ? (
        <div className="mt-3 space-y-1 rounded-lg bg-secondary px-3 py-2 text-sm">
          <p
            className={cn(
              "font-semibold",
              building.status !== "ok" && "text-destructive",
            )}
          >
            {STATUS_TEXT[building.status]}
          </p>
          {building.status === "ok" ? (
            <p className="text-muted-foreground">
              Made {made(building)} last day.
            </p>
          ) : null}
        </div>
      ) : null}

      {def?.bonus ? (
        <p
          className={cn(
            "mt-2 rounded-md px-3 py-2 text-sm",
            bonusOn
              ? "bg-primary/10 font-semibold text-primary"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {bonusOn ? "Bonus on: " : "Bonus: "}
          {def.bonus.text}
        </p>
      ) : null}

      {building && mine && building.kind !== "hall" ? (
        <div className="mt-4 space-y-2">
          {next ? (
            <Button
              className="h-auto w-full flex-col gap-1 py-2"
              onClick={() =>
                run(
                  { type: "upgrade", payload: { buildingId: building.id } },
                  `${def?.name} upgraded!`,
                )
              }
              disabled={game.phase !== "running"}
            >
              <span>Upgrade to level {building.level + 1}</span>
              <CostChips cost={next} have={city} />
            </Button>
          ) : (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              Top level reached ★★★
            </p>
          )}
          <div className="flex gap-2">
            {def?.workers ? (
              <Button
                variant="outline"
                className="flex-1"
                disabled={game.phase !== "running"}
                onClick={() =>
                  run({ type: "toggle", payload: { buildingId: building.id } })
                }
              >
                {building.running ? "Stop" : "Start"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className={cn(
                "flex-1",
                confirmRemove && "border-destructive text-destructive",
              )}
              disabled={game.phase !== "running"}
              onClick={async () => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return;
                }
                if (
                  await run({
                    type: "demolish",
                    payload: { buildingId: building.id },
                  })
                )
                  onClose();
              }}
              onBlur={() => setConfirmRemove(false)}
            >
              {confirmRemove ? "Tap again to remove" : "Remove"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
