import { ScenarioSchema } from "@cs/shared";
import { describe, expect, it } from "vitest";
import lc2 from "../../../scenarios/lc2-default.json";
import {
  adjacentFeatureIds,
  buildMap,
  inBounds,
  isOnPlot,
  isVisibleTo,
  neighbours,
  tileAt,
  visibleTiles,
} from "./map.ts";
import type { GameMap, Tile } from "./map.ts";

const scenario = ScenarioSchema.parse(lc2);
const map = buildMap(scenario);

describe("buildMap (RULE-030, RULE-031)", () => {
  it("has one tile per cell, row-major", () => {
    expect(map.tiles).toHaveLength(scenario.map.width * scenario.map.height);
    expect(tileAt(map, 3, 2)).toMatchObject({ x: 3, y: 2 });
  });

  it("maps legend characters to features", () => {
    scenario.map.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const expected = ch === "." ? null : scenario.map.legend[ch];
        expect(tileAt(map, x, y)?.featureId).toBe(expected);
      });
    });
  });

  it("marks every plot tile with its city", () => {
    for (const city of scenario.cities) {
      const owned = map.tiles.filter((t) => t.plotOf === city.id);
      expect(owned).toHaveLength(city.plot.width * city.plot.height);
    }
  });

  it("never puts a feature on a plot", () => {
    for (const t of map.tiles) {
      if (t.plotOf !== null) expect(t.featureId).toBeNull();
    }
  });

  it("is deterministic", () => {
    expect(buildMap(scenario)).toEqual(map);
  });
});

describe("bounds and neighbours (RULE-030)", () => {
  it("rejects out-of-range and non-integer positions", () => {
    expect(inBounds(map, -1, 0)).toBe(false);
    expect(inBounds(map, map.width, 0)).toBe(false);
    expect(inBounds(map, 0, map.height)).toBe(false);
    expect(inBounds(map, 0.5, 0)).toBe(false);
    expect(tileAt(map, -1, -1)).toBeUndefined();
  });

  it("returns four orthogonal neighbours inside the map", () => {
    const n = neighbours(map, 5, 5).map((t) => [t.x, t.y]);
    expect(n).toEqual([
      [5, 4],
      [6, 5],
      [5, 6],
      [4, 5],
    ]);
  });

  it("clips neighbours at corners and edges", () => {
    expect(neighbours(map, 0, 0)).toHaveLength(2);
    expect(neighbours(map, 0, 5)).toHaveLength(3);
    expect(neighbours(map, map.width - 1, map.height - 1)).toHaveLength(2);
  });
});

describe("adjacent features (RULE-030)", () => {
  it("ignores diagonals and de-duplicates", () => {
    const tile = (x: number, y: number, featureId: string | null): Tile => ({
      x,
      y,
      featureId,
      plotOf: null,
    });
    // 3x3: woods at the corners and left of centre, lake right of centre.
    const f = [
      ["w", null, "w"],
      ["w", null, "l"],
      ["w", null, "w"],
    ];
    const grid: GameMap = {
      width: 3,
      height: 3,
      tiles: f.flatMap((row, y) => row.map((id, x) => tile(x, y, id))),
      views: {},
    };
    expect(adjacentFeatureIds(grid, 1, 1)).toEqual(["l", "w"]);
    expect(adjacentFeatureIds(grid, 1, 0)).toEqual(["w"]);
  });

  it("reports each orthogonal feature once, never diagonals", () => {
    // Find any empty tile and compare against a direct neighbour scan.
    for (const t of map.tiles) {
      const expected = [
        ...new Set(
          neighbours(map, t.x, t.y)
            .map((n) => n.featureId)
            .filter((id): id is string => id !== null),
        ),
      ];
      expect(adjacentFeatureIds(map, t.x, t.y)).toEqual(expected);
    }
    expect(
      map.tiles.some((t) => adjacentFeatureIds(map, t.x, t.y).length > 0),
    ).toBe(true);
  });
});

describe("plots (RULE-031)", () => {
  it("allows building only on the city's own empty plot tiles", () => {
    const [a, b] = scenario.cities;
    if (!a || !b) throw new Error("need two cities");
    expect(isOnPlot(map, a.id, a.plot.x, a.plot.y)).toBe(true);
    expect(isOnPlot(map, b.id, a.plot.x, a.plot.y)).toBe(false);
    expect(isOnPlot(map, a.id, -1, 0)).toBe(false);
  });

  it("refuses feature tiles", () => {
    const feature = map.tiles.find((t) => t.featureId !== null);
    if (!feature) throw new Error("scenario has no features");
    for (const city of scenario.cities) {
      expect(isOnPlot(map, city.id, feature.x, feature.y)).toBe(false);
    }
  });
});

describe("visibility (RULE-032)", () => {
  it("shows each city exactly the tiles in its view", () => {
    for (const city of scenario.cities) {
      const v = visibleTiles(map, city.id);
      expect(v).toHaveLength(city.view.width * city.view.height);
      for (const t of v) {
        expect(t.x).toBeGreaterThanOrEqual(city.view.x);
        expect(t.x).toBeLessThan(city.view.x + city.view.width);
        expect(t.y).toBeGreaterThanOrEqual(city.view.y);
        expect(t.y).toBeLessThan(city.view.y + city.view.height);
      }
    }
  });

  it("always includes the city's own plot", () => {
    for (const city of scenario.cities) {
      for (const t of map.tiles) {
        if (t.plotOf === city.id) {
          expect(isVisibleTo(map, city.id, t.x, t.y)).toBe(true);
        }
      }
    }
  });

  it("hides at least some tiles from each city, and off-map tiles", () => {
    for (const city of scenario.cities) {
      const n = visibleTiles(map, city.id).length;
      expect(n).toBeLessThanOrEqual(map.tiles.length);
      expect(isVisibleTo(map, city.id, -1, -1)).toBe(false);
      expect(isVisibleTo(map, city.id, map.width, 0)).toBe(false);
    }
  });

  it("shows an unknown city nothing", () => {
    expect(isVisibleTo(map, "nobody", 0, 0)).toBe(false);
    expect(visibleTiles(map, "nobody")).toEqual([]);
  });
});
