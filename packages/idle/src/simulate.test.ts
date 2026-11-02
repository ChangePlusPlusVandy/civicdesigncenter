// Whole-game simulations with bot cities. They check the rules never break
// (no negative stocks), replay exactly, and that the balance teaches the
// lesson: overusing the commons loses to sharing it.

import { describe, expect, it } from "vitest";
import { BUILDABLE, GOODS, type BuildableKind } from "./content.ts";
import {
  housing,
  placementProblem,
  upgradeCost,
  canAfford,
} from "./economy.ts";
import { cityInfo, plotTiles, type CityId } from "./map.ts";
import { createGame, reduce } from "./rules.ts";
import type { CityState, IdleState, Intent } from "./types.ts";

type Strategy = (state: IdleState, city: CityState) => Intent | null;

function count(city: CityState, kind: BuildableKind): number {
  return city.buildings.filter((b) => b.kind === kind).length;
}

function buildAnywhere(
  state: IdleState,
  city: CityState,
  kind: BuildableKind,
): Intent | null {
  const tile = plotTiles(cityInfo(city.id)).find(
    ({ x, y }) => placementProblem(city, kind, x, y) === null,
  );
  return tile
    ? { type: "build", payload: { kind, x: tile.x, y: tile.y } }
    : null;
}

function upgradeFirst(city: CityState, kinds: BuildableKind[]): Intent | null {
  const target = city.buildings.find(
    (b) =>
      b.level < 3 &&
      kinds.includes(b.kind as BuildableKind) &&
      canAfford(city, upgradeCost(b.kind as BuildableKind, b.level + 1)),
  );
  return target
    ? { type: "upgrade", payload: { buildingId: target.id } }
    : null;
}

// Grows steadily, runs extractors only while nature is healthy, builds parks.
const sustainable: Strategy = (state, city) => {
  const fish = state.commons.river.stocks.fish ?? 0;
  const dock = city.buildings.find((b) => b.kind === "fishing-dock");
  // Rest the dock while the river recovers.
  if (dock && dock.running === fish < 100) {
    if (dock.running || fish > 130) {
      return { type: "toggle", payload: { buildingId: dock.id } };
    }
  }
  if (city.population >= housing(city) - 1) {
    const house = buildAnywhere(state, city, "house");
    if (house) return house;
  }
  // Cities without woods (like Blue) have to buy their wood.
  if (city.goods.wood < 15 && city.coins > 60) {
    return { type: "marketBuy", payload: { good: "wood", amount: 15 } };
  }
  if (count(city, "farm") < 1 + Math.floor(city.population / 5)) {
    const farm = buildAnywhere(state, city, "farm");
    if (farm) return farm;
  }
  if (count(city, "lumber-camp") < 1) {
    const camp = buildAnywhere(state, city, "lumber-camp");
    if (camp) return camp;
  }
  if (count(city, "fishing-dock") < 1 && fish > 120) {
    const dock = buildAnywhere(state, city, "fishing-dock");
    if (dock) return dock;
  }
  if (count(city, "clay-pit") < 1) {
    const pit = buildAnywhere(state, city, "clay-pit");
    if (pit) return pit;
  }
  if (city.pollution > 3 || count(city, "park") < 1) {
    const park = buildAnywhere(state, city, "park");
    if (park) return park;
  }
  if (city.goods.wood > 120)
    return { type: "marketSell", payload: { good: "wood", amount: 20 } };
  return null;
};

// Grabs everything it can and never stops a building.
const greedy: Strategy = (state, city) => {
  if (city.population >= housing(city) - 1) {
    const house = buildAnywhere(state, city, "house");
    if (house) return house;
  }
  for (const kind of [
    "fishing-dock",
    "lumber-camp",
    "hunting-lodge",
    "copper-mine",
    "clay-pit",
  ] as const) {
    const intent = buildAnywhere(state, city, kind);
    if (intent) return intent;
  }
  if (city.goods.food < 5) {
    const farm = buildAnywhere(state, city, "farm");
    if (farm) return farm;
  }
  if (city.coins > 80 && city.goods.copper < 8) {
    return { type: "marketBuy", payload: { good: "copper", amount: 8 } };
  }
  return upgradeFirst(city, [
    "fishing-dock",
    "lumber-camp",
    "hunting-lodge",
    "copper-mine",
  ]);
};

function play(strategy: Strategy, ticks: number) {
  let state = createGame(5);
  const start = reduce(state, { kind: "teacher" }, { type: "start" });
  if (!start.ok) throw new Error(start.error.message);
  state = start.state;
  let riverCollapsed = false;
  const log: Intent[] = [];

  for (let t = 0; t < ticks; t++) {
    for (const id of state.cityIds) {
      const city = state.cities[id] as CityState;
      const intent = strategy(state, city);
      if (!intent) continue;
      const result = reduce(state, { kind: "player", cityId: id }, intent);
      if (result.ok) {
        state = result.state;
        log.push(intent);
      }
    }
    const tick = reduce(state, { kind: "system" }, { type: "tick" });
    if (!tick.ok) throw new Error(tick.error.message);
    state = tick.state;
    riverCollapsed ||= state.commons.river.collapsed;
    assertSane(state);
  }
  return { state, riverCollapsed, log };
}

function assertSane(state: IdleState) {
  for (const id of state.cityIds) {
    const city = state.cities[id as CityId] as CityState;
    expect(city.coins).toBeGreaterThanOrEqual(0);
    for (const good of GOODS)
      expect(city.goods[good]).toBeGreaterThanOrEqual(0);
    expect(city.population).toBeGreaterThanOrEqual(1);
    expect(city.happiness).toBeGreaterThanOrEqual(0);
    expect(city.happiness).toBeLessThanOrEqual(100);
  }
  for (const commons of Object.values(state.commons)) {
    for (const stock of Object.values(commons.stocks))
      expect(stock).toBeGreaterThanOrEqual(0);
  }
  for (const good of GOODS)
    expect(state.market[good]).toBeGreaterThanOrEqual(0);
}

// Population weighted by how happy people are: a city of happy people beats a
// big miserable one.
function score(state: IdleState): number {
  return state.cityIds.reduce((sum, id) => {
    const city = state.cities[id] as CityState;
    return sum + city.population * (city.happiness / 100);
  }, 0);
}

describe("simulation", () => {
  it("replays exactly from the same actions", () => {
    const a = play(sustainable, 120);
    const b = play(sustainable, 120);
    expect(b.state).toEqual(a.state);
    expect(b.log).toEqual(a.log);
  });

  it("has a legal spot for every building kind on the starting map", () => {
    const start = createGame(5);
    for (const kind of BUILDABLE) {
      const somewhere = start.cityIds.some((id) => {
        const city = start.cities[id] as CityState;
        const rich = {
          ...start,
          cities: {
            ...start.cities,
            [id]: {
              ...city,
              coins: 999,
              goods: { food: 99, wood: 99, clay: 99, copper: 99 },
            },
          },
        };
        return plotTiles(cityInfo(id)).some(
          ({ x, y }) =>
            placementProblem(rich.cities[id] as CityState, kind, x, y) === null,
        );
      });
      expect(somewhere, kind).toBe(true);
    }
  });

  it("grabbing everything empties the river; sharing it wins over a full game", () => {
    const greedyGame = play(greedy, 450);
    const sharedGame = play(sustainable, 450);

    expect(greedyGame.riverCollapsed).toBe(true);
    expect(sharedGame.riverCollapsed).toBe(false);
    expect(score(sharedGame.state)).toBeGreaterThan(score(greedyGame.state));
    // Sharing isn't just fairer: those cities thrive.
    const shared = sharedGame.state.cityIds.map(
      (id) => (sharedGame.state.cities[id] as CityState).population,
    );
    expect(Math.min(...shared)).toBeGreaterThan(15);
  });
});
