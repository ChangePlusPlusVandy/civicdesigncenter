// Square-grid map built from a scenario. Static data: it never changes during
// a game, so it is not part of GameState. Pure and deterministic (RULE-002).

import { EMPTY_TILE } from "@cs/shared";
import type { Rect, Scenario } from "@cs/shared";

export type Pos = { x: number; y: number };

export type Tile = {
  x: number;
  y: number;
  // Nature feature on this tile (RULE-030, RULE-033), or null.
  featureId: string | null;
  // City whose plot contains this tile (RULE-031), or null.
  plotOf: string | null;
};

export type GameMap = {
  width: number;
  height: number;
  // Row-major: tile (x, y) is `tiles[y * width + x]`.
  tiles: readonly Tile[];
  // City id -> view rectangle (RULE-032).
  views: Readonly<Record<string, Rect>>;
};

// Offsets of the four orthogonal neighbours, in a fixed order (RULE-030):
// up, right, down, left.
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// RULE-030: tile (x, y) is `map.tiles[y][x]`; characters map to features
// through `map.legend`. RULE-031: each city's plot tiles are marked.
export function buildMap(scenario: Scenario): GameMap {
  const { width, height, tiles: rows, legend } = scenario.map;
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    const chars = [...(rows[y] ?? "")];
    for (let x = 0; x < width; x++) {
      const ch = chars[x] ?? EMPTY_TILE;
      tiles.push({
        x,
        y,
        featureId: ch === EMPTY_TILE ? null : (legend[ch] ?? null),
        plotOf: null,
      });
    }
  }
  for (const city of scenario.cities) {
    const { x, y, width: w, height: h } = city.plot;
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const tile = tiles[py * width + px];
        if (tile) tile.plotOf = city.id;
      }
    }
  }
  const views: Record<string, Rect> = {};
  for (const city of scenario.cities) views[city.id] = { ...city.view };
  return { width, height, tiles, views };
}

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height
  );
}

export function tileAt(map: GameMap, x: number, y: number): Tile | undefined {
  return inBounds(map, x, y) ? map.tiles[y * map.width + x] : undefined;
}

// RULE-030: the up-to-four orthogonal neighbours that are on the map. No
// diagonals.
export function neighbours(map: GameMap, x: number, y: number): Tile[] {
  const out: Tile[] = [];
  for (const [dx, dy] of NEIGHBOURS) {
    const tile = tileAt(map, x + dx, y + dy);
    if (tile) out.push(tile);
  }
  return out;
}

// RULE-030: the distinct features on the four neighbours of (x, y), in
// neighbour order. Used for building adjacency (RULE-085).
export function adjacentFeatureIds(
  map: GameMap,
  x: number,
  y: number,
): string[] {
  const ids: string[] = [];
  for (const n of neighbours(map, x, y)) {
    if (n.featureId !== null && !ids.includes(n.featureId)) {
      ids.push(n.featureId);
    }
  }
  return ids;
}

// RULE-031: a tile is buildable by `cityId` when it is on that city's plot
// and holds no feature. Occupancy by a building is tracked in game state,
// not here.
export function isOnPlot(
  map: GameMap,
  cityId: string,
  x: number,
  y: number,
): boolean {
  const tile = tileAt(map, x, y);
  return (
    tile !== undefined && tile.plotOf === cityId && tile.featureId === null
  );
}

// RULE-032: a city sees only the tiles in its view. An unknown city sees
// nothing.
export function isVisibleTo(
  map: GameMap,
  cityId: string,
  x: number,
  y: number,
): boolean {
  const view = map.views[cityId];
  if (view === undefined || !inBounds(map, x, y)) return false;
  return (
    x >= view.x &&
    y >= view.y &&
    x < view.x + view.width &&
    y < view.y + view.height
  );
}

// RULE-032: the tiles of a city's view, row-major. Empty for an unknown city.
export function visibleTiles(map: GameMap, cityId: string): Tile[] {
  return map.tiles.filter((t) => isVisibleTo(map, cityId, t.x, t.y));
}
