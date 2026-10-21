// A scenario is the data a game is played with: resources, buildings, the map
// and the cities on it. Rules live in packages/engine; scenarios stay data.
// See scenarios/README.md for how lc2-default.json was ported.

import { z } from "zod";

export const SCENARIO_SCHEMA_VERSION = 1;

// City stats every scenario has. Buildings may change them through `output`.
export const STAT_IDS = ["population", "happiness", "pollution"] as const;
export type StatId = (typeof STAT_IDS)[number];

// The map character for a tile with no nature feature.
export const EMPTY_TILE = ".";

const Id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "ids are lowercase kebab-case");

// Whole-number amounts keyed by resource or stat id. Negative values are
// allowed (a building can lower pollution).
const Amounts = z.record(Id, z.int());

const Rect = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
  width: z.int().min(1),
  height: z.int().min(1),
});
export type Rect = z.infer<typeof Rect>;

const Resource = z.strictObject({
  id: Id,
  name: z.string().min(1),
});

const Adjacency = z.strictObject({
  // Matches `Feature.kind`. Adjacent means one of the four orthogonal neighbours.
  featureKind: Id,
  // true: the building may only be placed next to such a feature.
  required: z.boolean(),
  // Taken from the adjacent feature's stocks each round the building runs.
  draws: Amounts,
  // Added to the adjacent feature's stocks each round the building runs.
  affects: Amounts,
  // Added to the building's output when it runs next to such a feature.
  bonusOutput: Amounts,
});

const Building = z.strictObject({
  id: Id,
  name: z.string().min(1),
  // Population a running building employs.
  workers: z.int().min(0),
  // Paid from the city's resources each round the building runs.
  upkeep: Amounts,
  // Added to the city's resources and stats each round the building runs.
  output: Amounts,
  adjacency: Adjacency.optional(),
});

const Feature = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: Id,
  stocks: z.record(Id, z.int().min(0)),
  // Starting multiplier applied to each stock between rounds.
  regrowth: z.record(Id, z.number().min(0)),
});

const City = z.strictObject({
  id: Id,
  name: z.string().min(1),
  color: z.string().min(1),
  // The tiles the city owns and builds on.
  plot: Rect,
  // The part of the map the city can see. Must contain the plot.
  view: Rect,
});

const GameMap = z.strictObject({
  width: z.int().min(1),
  height: z.int().min(1),
  // One string per row, top to bottom; one character per tile, left to right.
  // "." is empty; any other character is a key of `legend`.
  tiles: z.array(z.string()),
  // Tile character -> feature id.
  legend: z.record(z.string().length(1), Id),
});

const ScenarioObject = z.strictObject({
  schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1),
  description: z.string().optional(),
  // Resources cities hold, trade and bid with.
  resources: z.array(Resource).min(1),
  // Resources only nature features hold (fish, animals).
  natureResources: z.array(Resource),
  start: z.strictObject({
    year: z.int().min(1),
    // Missing resources start at 0.
    resources: z.record(Id, z.int().min(0)),
    stats: z.strictObject({
      population: z.int().min(0),
      happiness: z.int().min(0),
      pollution: z.int().min(0),
    }),
  }),
  buildings: z.array(Building).min(1),
  map: GameMap,
  features: z.array(Feature),
  cities: z.array(City).min(1),
});

type ScenarioShape = z.infer<typeof ScenarioObject>;

export const ScenarioSchema = ScenarioObject.superRefine(checkReferences);
export type Scenario = z.infer<typeof ScenarioSchema>;
export type BuildingDef = Scenario["buildings"][number];
export type FeatureDef = Scenario["features"][number];
export type CityDef = Scenario["cities"][number];

type Ctx = z.RefinementCtx<ScenarioShape>;
type Path = (string | number)[];

// Cross-field checks: every id a scenario mentions must be declared, and
// everything placed on the map must fit and not overlap.
function checkReferences(s: ScenarioShape, ctx: Ctx): void {
  const issue = (path: Path, message: string) =>
    ctx.addIssue({ code: "custom", path, message });

  unique(
    [...s.resources, ...s.natureResources].map((r) => r.id),
    ["resources"],
    issue,
  );
  unique(
    s.buildings.map((b) => b.id),
    ["buildings"],
    issue,
  );
  unique(
    s.features.map((f) => f.id),
    ["features"],
    issue,
  );
  unique(
    s.cities.map((c) => c.id),
    ["cities"],
    issue,
  );

  const resources = new Set(s.resources.map((r) => r.id));
  const stats = new Set<string>(STAT_IDS);
  for (const r of [...s.resources, ...s.natureResources]) {
    if (stats.has(r.id)) {
      issue(["resources"], `"${r.id}" is a stat, not a resource`);
    }
  }
  const cityKeys = new Set([...resources, ...stats]);
  // Features can hold any resource, plus pollution (a polluted lake).
  const featureKeys = new Set([
    ...resources,
    ...s.natureResources.map((r) => r.id),
    "pollution",
  ]);
  const featureKinds = new Set(s.features.map((f) => f.kind));

  keysIn(s.start.resources, resources, ["start", "resources"], issue);

  s.buildings.forEach((b, i) => {
    const at: Path = ["buildings", i];
    keysIn(b.upkeep, resources, [...at, "upkeep"], issue);
    keysIn(b.output, cityKeys, [...at, "output"], issue);
    if (b.adjacency) {
      const adj = b.adjacency;
      if (!featureKinds.has(adj.featureKind)) {
        issue(
          [...at, "adjacency", "featureKind"],
          `no feature has kind "${adj.featureKind}"`,
        );
      }
      keysIn(adj.draws, featureKeys, [...at, "adjacency", "draws"], issue);
      keysIn(adj.affects, featureKeys, [...at, "adjacency", "affects"], issue);
      keysIn(
        adj.bonusOutput,
        cityKeys,
        [...at, "adjacency", "bonusOutput"],
        issue,
      );
    }
  });

  s.features.forEach((f, i) => {
    keysIn(f.stocks, featureKeys, ["features", i, "stocks"], issue);
    keysIn(f.regrowth, featureKeys, ["features", i, "regrowth"], issue);
  });

  checkMap(s, issue);
}

function checkMap(
  s: ScenarioShape,
  issue: (path: Path, message: string) => void,
): void {
  const { width, height, tiles, legend } = s.map;
  const featureIds = new Set(s.features.map((f) => f.id));
  const seen = new Set<string>();

  if (tiles.length !== height) {
    issue(["map", "tiles"], `expected ${height} rows, got ${tiles.length}`);
  }
  for (const [ch, featureId] of Object.entries(legend)) {
    if (ch === EMPTY_TILE) {
      issue(["map", "legend"], `"${EMPTY_TILE}" is reserved for empty tiles`);
    }
    if (!featureIds.has(featureId)) {
      issue(["map", "legend", ch], `unknown feature "${featureId}"`);
    }
  }
  // Tiles already taken by a feature or a plot, as "x,y".
  const taken = new Set<string>();
  tiles.forEach((row, y) => {
    const chars = [...row];
    if (chars.length !== width) {
      issue(
        ["map", "tiles", y],
        `expected ${width} tiles, got ${chars.length}`,
      );
    }
    chars.forEach((ch, x) => {
      if (ch === EMPTY_TILE) return;
      const featureId = legend[ch];
      if (featureId === undefined) {
        issue(["map", "tiles", y], `"${ch}" at x=${x} is not in the legend`);
        return;
      }
      seen.add(featureId);
      taken.add(`${x},${y}`);
    });
  });
  for (const f of s.features) {
    if (!seen.has(f.id)) {
      issue(["features"], `feature "${f.id}" has no tiles on the map`);
    }
  }

  const inside = (r: Rect) =>
    r.x + r.width <= width && r.y + r.height <= height;
  s.cities.forEach((c, i) => {
    if (!inside(c.plot)) {
      issue(["cities", i, "plot"], "plot is outside the map");
    }
    if (!inside(c.view)) {
      issue(["cities", i, "view"], "view is outside the map");
    }
    if (!contains(c.view, c.plot)) {
      issue(["cities", i, "view"], "view must contain the plot");
    }
    for (const [x, y] of cells(c.plot)) {
      const key = `${x},${y}`;
      if (taken.has(key)) {
        issue(
          ["cities", i, "plot"],
          `plot overlaps another plot or a feature at ${key}`,
        );
        break;
      }
    }
    for (const [x, y] of cells(c.plot)) taken.add(`${x},${y}`);
  });
}

function unique(
  ids: string[],
  path: Path,
  issue: (path: Path, message: string) => void,
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) issue(path, `duplicate id "${id}"`);
    seen.add(id);
  }
}

function keysIn(
  amounts: Record<string, unknown>,
  allowed: Set<string>,
  path: Path,
  issue: (path: Path, message: string) => void,
): void {
  for (const key of Object.keys(amounts)) {
    if (!allowed.has(key)) {
      issue([...path, key], `unknown resource or stat "${key}"`);
    }
  }
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function* cells(r: Rect): Generator<[number, number]> {
  for (let y = r.y; y < r.y + r.height; y++) {
    for (let x = r.x; x < r.x + r.width; x++) yield [x, y];
  }
}
