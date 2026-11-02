// The world map. The layout is LC2's (scenarios/lc2-default.json on
// feat/engine-core): a 16×16 grid, five cities, a river, two woods and two
// ore deposits.

export type TileKind = "grass" | "woods" | "water" | "clay" | "copper";

export type CommonsId = "river" | "westWoods" | "eastWoods";

export type CityId = "red" | "green" | "pink" | "blue" | "yellow";

export interface Plot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CityInfo {
  id: CityId;
  name: string;
  color: string;
  plot: Plot;
  hall: { x: number; y: number };
}

export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
  commons?: CommonsId;
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

const LEGEND: Record<string, Omit<Tile, "x" | "y">> = {
  ".": { kind: "grass" },
  W: { kind: "woods", commons: "westWoods" },
  w: { kind: "woods", commons: "eastWoods" },
  "~": { kind: "water", commons: "river" },
  c: { kind: "clay" },
  u: { kind: "copper" },
};

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

export const TILES: readonly Tile[] = TILE_ROWS.flatMap((row, y) =>
  [...row].map((char, x) => ({ x, y, ...(LEGEND[char] ?? { kind: "grass" }) })),
);

export const CITIES: readonly CityInfo[] = [
  {
    id: "red",
    name: "Red City",
    color: "#d9574a",
    plot: { x: 1, y: 1, width: 4, height: 4 },
    hall: { x: 2, y: 2 },
  },
  {
    id: "green",
    name: "Green City",
    color: "#3f9a5a",
    plot: { x: 9, y: 0, width: 4, height: 4 },
    hall: { x: 10, y: 1 },
  },
  {
    id: "pink",
    name: "Pink City",
    color: "#dc6aa9",
    plot: { x: 12, y: 6, width: 4, height: 4 },
    hall: { x: 13, y: 7 },
  },
  {
    id: "blue",
    name: "Blue City",
    color: "#4b76d1",
    plot: { x: 12, y: 12, width: 4, height: 4 },
    hall: { x: 14, y: 14 },
  },
  {
    id: "yellow",
    name: "Yellow City",
    color: "#e2ad2c",
    plot: { x: 2, y: 12, width: 4, height: 4 },
    hall: { x: 3, y: 13 },
  },
];

export const COMMONS_NAMES: Record<CommonsId, string> = {
  river: "The River",
  westWoods: "West Woods",
  eastWoods: "East Woods",
};

export const TILE_NAMES: Record<TileKind, string> = {
  grass: "Open land",
  woods: "Woods",
  water: "River",
  clay: "Clay deposit",
  copper: "Copper deposit",
};

export function tileAt(x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return undefined;
  return TILES[y * MAP_WIDTH + x];
}

export function cityInfo(id: CityId): CityInfo {
  const city = CITIES.find((candidate) => candidate.id === id);
  if (!city) throw new Error(`unknown city ${id}`);
  return city;
}

export function cityAt(x: number, y: number): CityInfo | undefined {
  return CITIES.find(
    ({ plot }) =>
      x >= plot.x &&
      x < plot.x + plot.width &&
      y >= plot.y &&
      y < plot.y + plot.height,
  );
}

export function plotTiles(city: CityInfo): Tile[] {
  const { x, y, width, height } = city.plot;
  return Array.from(
    { length: width * height },
    (_, i) => tileAt(x + (i % width), y + Math.floor(i / width)) as Tile,
  );
}

// LC2 counts the four orthogonal cells as neighbors.
export function neighbors(x: number, y: number): Tile[] {
  return [
    tileAt(x - 1, y),
    tileAt(x + 1, y),
    tileAt(x, y - 1),
    tileAt(x, y + 1),
  ].filter((tile): tile is Tile => tile !== undefined);
}

export function neighborOfKind(
  x: number,
  y: number,
  kind: TileKind,
): Tile | undefined {
  return neighbors(x, y).find((tile) => tile.kind === kind);
}

// Cities whose land touches a commons share it. Matches LC2's hand-written
// neighbor lists: the river borders Green, Blue and Yellow.
export function citiesBordering(commons: CommonsId): CityId[] {
  return CITIES.filter((city) =>
    plotTiles(city).some((tile) =>
      neighbors(tile.x, tile.y).some((n) => n.commons === commons),
    ),
  ).map((city) => city.id);
}
