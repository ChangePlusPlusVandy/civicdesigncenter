// World maps. Every map is a 16×16 grid with five city slots, one river and
// two woods, so the rules and their balance carry over; what changes is the
// layout, the names and the landmarks. A game picks its map when created.

// What a map cell is. Clay and copper deposits give nearby pits and mines a
// bonus.
export type TileKind =
  | "grass"
  | "woods"
  | "water"
  | "clay"
  | "copper"
  // Built-up land nobody can build on (Nashville's downtown).
  | "downtown";

// The shared resources every map has: one river and two woods.
export type CommonsId = "river" | "westWoods" | "eastWoods";

// City slots. Each map gives every slot its own name.
export type CityId = "red" | "green" | "pink" | "blue" | "yellow";

// The maps a teacher can pick.
export type MapId = "classic" | "nashville";

// A rectangle of cells, in grid coordinates.
export interface Plot {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A city slot on one map: its name, colour, land and town hall.
export interface CityInfo {
  id: CityId;
  name: string;
  color: string;
  plot: Plot;
  hall: { x: number; y: number };
}

// One map cell. Water and woods cells belong to a commons.
export interface Tile {
  x: number;
  y: number;
  kind: TileKind;
  commons?: CommonsId;
}

// Decorations drawn on top of the map, with an optional floating name.
export interface Landmark {
  kind: "skyline" | "bridge";
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

// A map's layout plus the lookups the rules and the 3D view share.
export interface GameMap {
  id: MapId;
  name: string;
  blurb: string;
  tiles: readonly Tile[];
  cities: readonly CityInfo[];
  commonsNames: Record<CommonsId, string>;
  // Where the river and woods names float, in grid cells.
  commonsLabels: Partial<Record<CommonsId, { x: number; y: number }>>;
  landmarks: readonly Landmark[];
  tileAt(x: number, y: number): Tile | undefined;
  cityAt(x: number, y: number): CityInfo | undefined;
  cityInfo(id: CityId): CityInfo;
  plotTiles(city: CityInfo): Tile[];
  neighbors(x: number, y: number): Tile[];
  neighborOfKind(x: number, y: number, kind: TileKind): Tile | undefined;
  // Cities whose land touches this commons share it.
  citiesBordering(commons: CommonsId): CityId[];
}

// The grid size, in cells. The same for every map.
export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

const LEGEND: Record<string, Omit<Tile, "x" | "y">> = {
  ".": { kind: "grass" },
  W: { kind: "woods", commons: "westWoods" },
  w: { kind: "woods", commons: "eastWoods" },
  "~": { kind: "water", commons: "river" },
  c: { kind: "clay" },
  u: { kind: "copper" },
  D: { kind: "downtown" },
};

const COLORS: Record<CityId, string> = {
  red: "#d9574a",
  green: "#3f9a5a",
  pink: "#dc6aa9",
  blue: "#4b76d1",
  yellow: "#e2ad2c",
};

// Every city slot, in map order.
export const CITY_IDS = Object.keys(COLORS) as CityId[];

interface MapSpec {
  id: MapId;
  name: string;
  blurb: string;
  rows: string[];
  // In slot order: games with fewer cities use the first ones.
  cities: (Omit<CityInfo, "color"> & { color?: string })[];
  commonsNames: Record<CommonsId, string>;
  commonsLabels?: GameMap["commonsLabels"];
  landmarks?: Landmark[];
}

function defineMap(spec: MapSpec): GameMap {
  if (
    spec.rows.length !== MAP_HEIGHT ||
    spec.rows.some((row) => row.length !== MAP_WIDTH)
  ) {
    throw new Error(`map ${spec.id} must be ${MAP_WIDTH}×${MAP_HEIGHT}`);
  }
  const tiles: Tile[] = spec.rows.flatMap((row, y) =>
    [...row].map((char, x) => ({
      x,
      y,
      ...(LEGEND[char] ?? { kind: "grass" as const }),
    })),
  );
  const cities: CityInfo[] = spec.cities.map((city) => ({
    ...city,
    color: city.color ?? COLORS[city.id],
  }));

  const tileAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT
      ? undefined
      : tiles[y * MAP_WIDTH + x];
  const neighbors = (x: number, y: number) =>
    // LC2 counts the four orthogonal cells as neighbors.
    [
      tileAt(x - 1, y),
      tileAt(x + 1, y),
      tileAt(x, y - 1),
      tileAt(x, y + 1),
    ].filter((tile): tile is Tile => tile !== undefined);
  const plotTiles = ({ plot }: CityInfo) =>
    Array.from(
      { length: plot.width * plot.height },
      (_, i) =>
        tileAt(
          plot.x + (i % plot.width),
          plot.y + Math.floor(i / plot.width),
        ) as Tile,
    );
  const bordering = new Map<CommonsId, CityId[]>();
  for (const commons of ["river", "westWoods", "eastWoods"] as const) {
    bordering.set(
      commons,
      cities
        .filter((city) =>
          plotTiles(city).some((tile) =>
            neighbors(tile.x, tile.y).some((n) => n.commons === commons),
          ),
        )
        .map((city) => city.id),
    );
  }

  return {
    id: spec.id,
    name: spec.name,
    blurb: spec.blurb,
    tiles,
    cities,
    commonsNames: spec.commonsNames,
    commonsLabels: spec.commonsLabels ?? {},
    landmarks: spec.landmarks ?? [],
    tileAt,
    cityAt: (x, y) =>
      cities.find(
        ({ plot }) =>
          x >= plot.x &&
          x < plot.x + plot.width &&
          y >= plot.y &&
          y < plot.y + plot.height,
      ),
    cityInfo: (id) => {
      const city = cities.find((candidate) => candidate.id === id);
      if (!city) throw new Error(`map ${spec.id} has no city ${id}`);
      return city;
    },
    plotTiles,
    neighbors,
    neighborOfKind: (x, y, kind) =>
      neighbors(x, y).find((tile) => tile.kind === kind),
    citiesBordering: (commons) => bordering.get(commons) ?? [],
  };
}

// LC2's map (scenarios/lc2-default.json on feat/engine-core).
const CLASSIC = defineMap({
  id: "classic",
  name: "The Valley",
  blurb:
    "The original City Settlers map: five towns around a lake and two forests.",
  rows: [
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
  ],
  cities: [
    {
      id: "red",
      name: "Red City",
      plot: { x: 1, y: 1, width: 4, height: 4 },
      hall: { x: 2, y: 2 },
    },
    {
      id: "green",
      name: "Green City",
      plot: { x: 9, y: 0, width: 4, height: 4 },
      hall: { x: 10, y: 1 },
    },
    {
      id: "pink",
      name: "Pink City",
      plot: { x: 12, y: 6, width: 4, height: 4 },
      hall: { x: 13, y: 7 },
    },
    {
      id: "blue",
      name: "Blue City",
      plot: { x: 12, y: 12, width: 4, height: 4 },
      hall: { x: 14, y: 14 },
    },
    {
      id: "yellow",
      name: "Yellow City",
      plot: { x: 2, y: 12, width: 4, height: 4 },
      hall: { x: 3, y: 13 },
    },
  ],
  commonsNames: {
    river: "The River",
    westWoods: "West Woods",
    eastWoods: "East Woods",
  },
  commonsLabels: {
    river: { x: 8, y: 13 },
    westWoods: { x: 1, y: 8 },
    eastWoods: { x: 14, y: 2 },
  },
});

// A draft Nashville for the stakeholder workshop (#27, #38): the Cumberland
// winds past Germantown, Downtown and East Nashville, Percy Warner's woods
// line the west, and Shelby Bottoms sits on the east bank. Germantown and The
// Gulch have no woods, so they must trade for wood.
const NASHVILLE = defineMap({
  id: "nashville",
  name: "Nashville",
  blurb:
    "A Nashville-inspired map: five neighborhoods along the Cumberland River.",
  rows: [
    "WWW.........~~ww",
    "WWW.........~~ww",
    "WWW........~~.ww",
    "W.........~~..ww",
    "W.........~~...w",
    "W........~~....w",
    "W........~~....w",
    "W....DDD~~.....w",
    "W....DDD~~.....w",
    "W....DDD~~......",
    "Wcc.....~~......",
    "Wcc.....~~......",
    ".........~~.....",
    "........uu~~....",
    "........uu.~~...",
    "............~~..",
  ],
  cities: [
    {
      id: "red",
      name: "Germantown",
      plot: { x: 5, y: 2, width: 4, height: 4 },
      hall: { x: 6, y: 3 },
    },
    {
      id: "green",
      name: "East Nashville",
      plot: { x: 11, y: 5, width: 4, height: 4 },
      hall: { x: 12, y: 6 },
    },
    {
      id: "pink",
      name: "The Gulch",
      plot: { x: 4, y: 11, width: 4, height: 4 },
      hall: { x: 5, y: 12 },
    },
    {
      id: "blue",
      name: "Sylvan Park",
      plot: { x: 1, y: 5, width: 4, height: 4 },
      hall: { x: 2, y: 6 },
    },
    {
      id: "yellow",
      name: "12 South",
      plot: { x: 0, y: 12, width: 4, height: 4 },
      hall: { x: 2, y: 14 },
    },
  ],
  commonsNames: {
    river: "Cumberland River",
    westWoods: "Percy Warner Woods",
    eastWoods: "Shelby Bottoms",
  },
  commonsLabels: {
    river: { x: 10, y: 4 },
    westWoods: { x: 1, y: 1 },
    eastWoods: { x: 14, y: 1 },
  },
  landmarks: [
    { kind: "skyline", x: 5, y: 7, width: 3, height: 3, label: "Downtown" },
    { kind: "bridge", x: 8, y: 8, width: 2, height: 1 },
  ],
});

// Every map, by id.
export const MAPS: Record<MapId, GameMap> = {
  classic: CLASSIC,
  nashville: NASHVILLE,
};

// Every map id, for validating requests.
export const MAP_IDS = Object.keys(MAPS) as MapId[];

// The map with this id, or the classic map for an unknown id.
export function getMap(id: string | undefined): GameMap {
  return MAPS[id as MapId] ?? CLASSIC;
}

// Names of tile kinds, shown when a student taps a cell.
export const TILE_NAMES: Record<TileKind, string> = {
  grass: "Open land",
  woods: "Woods",
  water: "River",
  clay: "Clay deposit",
  copper: "Copper deposit",
  downtown: "Downtown",
};
