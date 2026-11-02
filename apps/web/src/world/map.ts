// Map and demo data for the 3D world prototype. The layout is copied from
// scenarios/lc2-default.json (feat/engine-core); swap this for the scenario
// and the server projection once the engine and sockets land.

export type TileKind = "grass" | "woods" | "water" | "clay" | "copper";

export type ProductionKind =
  | "farm"
  | "lumber-camp"
  | "fishing-camp"
  | "hunting-camp"
  | "clay-mine"
  | "copper-mine";

export type BuildingKind = ProductionKind | "house" | "hall";

export interface Plot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface City {
  id: string;
  name: string;
  color: string;
  plot: Plot;
}

export interface PlacedBuilding {
  id: string;
  kind: BuildingKind;
  cityId: string;
  x: number;
  y: number;
  running: boolean;
}

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
}

const TILE_ROWS = [
  ".......~~....www",
  ".......~~....www",
  "W.....~~.....www",
  "W.....~~.....www",
  "W.....~~....wwww",
  "WWWcc.~~....wwww",
  "WWWcc~~.........",
  "WWW..~~.........",
  "WWW..~~.........",
  "WWW..~~.........",
  "WWW..~~.......uu",
  "WWW..~~.......uu",
  "WW....~~~~~~....",
  "WW....~~~~~~....",
  "WW........~~....",
  "WW........~~....",
];

const LEGEND: Record<string, TileKind> = {
  ".": "grass",
  W: "woods",
  w: "woods",
  "~": "water",
  c: "clay",
  u: "copper",
};

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

export const TILES: Tile[] = TILE_ROWS.flatMap((row, y) =>
  [...row].map((char, x) => ({ x, y, kind: LEGEND[char] ?? "grass" })),
);

export const CITIES: City[] = [
  {
    id: "red",
    name: "Red City",
    color: "#d9574a",
    plot: { x: 1, y: 1, width: 4, height: 4 },
  },
  {
    id: "green",
    name: "Green City",
    color: "#3f9a5a",
    plot: { x: 9, y: 0, width: 4, height: 4 },
  },
  {
    id: "pink",
    name: "Pink City",
    color: "#dc6aa9",
    plot: { x: 12, y: 6, width: 4, height: 4 },
  },
  {
    id: "blue",
    name: "Blue City",
    color: "#4b76d1",
    plot: { x: 12, y: 12, width: 4, height: 4 },
  },
  {
    id: "yellow",
    name: "Yellow City",
    color: "#e2ad2c",
    plot: { x: 2, y: 12, width: 4, height: 4 },
  },
];

// In LC2 the lake's pollution comes from the cities along its banks.
const RIVER_CITIES = ["green", "blue", "yellow"];

// 0 (clear) to 1 (murky), for tinting the water.
export function riverMurk(pollution: Record<string, number>): number {
  const total = RIVER_CITIES.reduce((sum, id) => sum + (pollution[id] ?? 0), 0);
  return Math.min(Math.max((total - 6) / 30, 0), 1);
}

export const TILE_LABELS: Record<TileKind, string> = {
  grass: "Open land",
  woods: "Woods",
  water: "River",
  clay: "Clay deposit",
  copper: "Copper deposit",
};

interface ProductionInfo {
  name: string;
  summary: string;
  needs?: TileKind;
  bonusNear?: TileKind;
  bonus?: string;
}

// Numbers follow LC2 so the prototype tells the same story as the old game.
export const PRODUCTION: Record<ProductionKind, ProductionInfo> = {
  farm: {
    name: "Farm",
    summary: "Makes 4 food. Uses 2 lumber and 1 clay.",
    bonusNear: "water",
    bonus: "+2 food next to the river, but it pollutes the water.",
  },
  "lumber-camp": {
    name: "Lumber Camp",
    summary: "Makes 5 lumber. Uses 1 clay and 3 lumber from the woods.",
    needs: "woods",
  },
  "fishing-camp": {
    name: "Fishing Camp",
    summary: "Makes 5 food. Uses 1 copper and 2 fish from the river.",
    needs: "water",
  },
  "hunting-camp": {
    name: "Hunting Camp",
    summary: "Makes 3 food. Uses 2 animals from the woods.",
    needs: "woods",
  },
  "clay-mine": {
    name: "Clay Mine",
    summary: "Makes 5 clay and 2 pollution. Uses 2 food and 2 lumber.",
    bonusNear: "clay",
    bonus: "+2 clay and less pollution next to a clay deposit.",
  },
  "copper-mine": {
    name: "Copper Mine",
    summary: "Makes 5 copper and 2 pollution. Uses 2 food and 2 lumber.",
    bonusNear: "copper",
    bonus: "+2 copper and less pollution next to a copper deposit.",
  },
};

export const PRODUCTION_KINDS = Object.keys(PRODUCTION) as ProductionKind[];

export function isProduction(kind: BuildingKind): kind is ProductionKind {
  return kind in PRODUCTION;
}

export function tileAt(x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
    return undefined;
  }
  return TILES[y * MAP_WIDTH + x];
}

export function cityAt(x: number, y: number): City | undefined {
  return CITIES.find(
    ({ plot }) =>
      x >= plot.x &&
      x < plot.x + plot.width &&
      y >= plot.y &&
      y < plot.y + plot.height,
  );
}

// LC2 counts the four orthogonal cells as neighbors.
export function isNextTo(x: number, y: number, kind: TileKind): boolean {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].some(([nx = -1, ny = -1]) => tileAt(nx, ny)?.kind === kind);
}

export function placementProblem(
  kind: ProductionKind,
  x: number,
  y: number,
  cityId: string,
  buildings: PlacedBuilding[],
): string | null {
  const owner = cityAt(x, y);
  const info = PRODUCTION[kind];

  if (!owner) {
    return "You can only build inside your city's land.";
  }
  if (owner.id !== cityId) {
    return `That land belongs to ${owner.name}.`;
  }
  if (buildings.some((building) => building.x === x && building.y === y)) {
    return "Something is already built there.";
  }
  if (info.needs && !isNextTo(x, y, info.needs)) {
    return `A ${info.name} needs ${TILE_LABELS[info.needs].toLowerCase()} right next to it.`;
  }
  return null;
}

export function hasBonus(kind: ProductionKind, x: number, y: number): boolean {
  const near = PRODUCTION[kind].bonusNear;
  return near ? isNextTo(x, y, near) : false;
}

function demo(
  cityId: string,
  kind: BuildingKind,
  x: number,
  y: number,
  running = true,
): PlacedBuilding {
  return { id: `${cityId}-${kind}-${x}-${y}`, kind, cityId, x, y, running };
}

// A mid-game snapshot so the world looks lived in.
export function createDemoBuildings(): PlacedBuilding[] {
  return [
    demo("red", "hall", 2, 2),
    demo("red", "house", 3, 2),
    demo("red", "house", 2, 1),
    demo("red", "house", 3, 1),
    demo("red", "clay-mine", 3, 4),
    demo("red", "lumber-camp", 1, 3),

    demo("green", "hall", 10, 1),
    demo("green", "house", 11, 1),
    demo("green", "house", 10, 2),
    demo("green", "house", 11, 2),
    demo("green", "house", 11, 0),
    demo("green", "fishing-camp", 9, 1),
    demo("green", "lumber-camp", 12, 2),
    demo("green", "farm", 10, 3, false),

    demo("pink", "hall", 13, 7),
    demo("pink", "house", 14, 7),
    demo("pink", "house", 13, 8),
    demo("pink", "hunting-camp", 13, 6),
    demo("pink", "copper-mine", 14, 9),

    demo("blue", "hall", 14, 14),
    demo("blue", "house", 13, 14),
    demo("blue", "house", 14, 15),
    demo("blue", "house", 15, 14),
    demo("blue", "copper-mine", 15, 12),
    demo("blue", "fishing-camp", 12, 13),
    demo("blue", "farm", 12, 14),

    demo("yellow", "hall", 3, 13),
    demo("yellow", "house", 4, 13),
    demo("yellow", "house", 3, 14),
    demo("yellow", "fishing-camp", 5, 12),
    demo("yellow", "lumber-camp", 2, 14),
    demo("yellow", "farm", 5, 13),
  ];
}

// Deterministic per-tile noise so the map looks the same on every device.
export function hash(x: number, y: number, salt = 0): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}
