// Every map has to give students the same kind of game: buildable plots,
// a river shared by several cities, woods to share, deposits someone can
// mine, and at least one city that has to trade for wood.

import { describe, expect, it } from "vitest";
import { MAPS, MAP_IDS, getMap, type CommonsId } from "./map.ts";

describe.each(MAP_IDS)("the %s map", (id) => {
  const map = MAPS[id];

  it("has five plots of open land that don't overlap, each with its hall", () => {
    expect(map.cities).toHaveLength(5);
    const owners = new Map<string, string>();
    for (const city of map.cities) {
      for (const tile of map.plotTiles(city)) {
        expect(tile.kind, `${city.name} at ${tile.x},${tile.y}`).toBe("grass");
        const key = `${tile.x},${tile.y}`;
        expect(owners.get(key), `${key} is in two plots`).toBeUndefined();
        owners.set(key, city.name);
      }
      expect(map.cityAt(city.hall.x, city.hall.y)?.id).toBe(city.id);
    }
  });

  it("shares the river among at least three cities and every woods with someone", () => {
    expect(map.citiesBordering("river").length).toBeGreaterThanOrEqual(3);
    expect(map.citiesBordering("westWoods").length).toBeGreaterThanOrEqual(1);
    expect(map.citiesBordering("eastWoods").length).toBeGreaterThanOrEqual(1);
  });

  it("leaves at least one city without woods, so it has to trade", () => {
    const wooded = new Set([
      ...map.citiesBordering("westWoods"),
      ...map.citiesBordering("eastWoods"),
    ]);
    expect(map.cities.some((city) => !wooded.has(city.id))).toBe(true);
  });

  it("puts every deposit next to some city's land", () => {
    for (const kind of ["clay", "copper"] as const) {
      const reachable = map.cities.some((city) =>
        map
          .plotTiles(city)
          .some((tile) => map.neighborOfKind(tile.x, tile.y, kind)),
      );
      expect(reachable, kind).toBe(true);
    }
  });

  it("floats each commons name over its own water or woods", () => {
    for (const [commons, spot] of Object.entries(map.commonsLabels)) {
      expect(map.tileAt(spot.x, spot.y)?.commons).toBe(commons as CommonsId);
    }
  });

  it("keeps landmarks on the map and off city land", () => {
    for (const landmark of map.landmarks) {
      for (let dx = 0; dx < landmark.width; dx++) {
        for (let dy = 0; dy < landmark.height; dy++) {
          expect(map.tileAt(landmark.x + dx, landmark.y + dy)).toBeDefined();
          expect(map.cityAt(landmark.x + dx, landmark.y + dy)).toBeUndefined();
        }
      }
    }
  });
});

it("falls back to the classic map for unknown ids", () => {
  expect(getMap("atlantis").id).toBe("classic");
});
