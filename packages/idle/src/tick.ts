// One production step: every city works, eats, pays taxes and grows; then
// the river and woods react to everyone at once.

import {
  BUILDINGS,
  COLLAPSED,
  COMMONS,
  FOOD_PER_PERSON,
  GOODS,
  GROWTH_MIN_HAPPINESS,
  GROWTH_RATE,
  HAPPINESS_EASE,
  HISTORY_EVERY,
  HISTORY_LENGTH,
  MARKET,
  POLLUTION_DECAY,
  RECOVERED,
  RIVER_DECAY,
  RIVER_DRIFT,
  STARVE_RATE,
  STORAGE_CAP,
  TAX_PER_PERSON,
  TRADE,
  type Good,
} from "./content.ts";
import {
  buildingRates,
  housing,
  parkCleaning,
  regionHealth,
  round3,
  targetHappiness,
} from "./economy.ts";
import { citiesBordering, type CityId, type CommonsId } from "./map.ts";
import { checkGoals } from "./goals.ts";
import type {
  Building,
  CityState,
  CommonsState,
  GameEvent,
  IdleState,
  ReduceResult,
} from "./types.ts";

const COMMONS_IDS: CommonsId[] = ["river", "westWoods", "eastWoods"];

export function runTick(state: IdleState): ReduceResult {
  const events: GameEvent[] = [];
  const commons = Object.fromEntries(
    COMMONS_IDS.map((id) => [
      id,
      { ...state.commons[id], stocks: { ...state.commons[id].stocks } },
    ]),
  ) as Record<CommonsId, CommonsState>;
  let riverRunoff = 0;

  // Rotate who goes first so no city always gets the last fish.
  const order = state.cityIds.map(
    (_, i) => state.cityIds[(i + state.tick) % state.cityIds.length] as CityId,
  );

  const cities: IdleState["cities"] = { ...state.cities };
  for (const id of order) {
    const city = cities[id];
    if (!city) continue;
    const worked = work(state, city, commons);
    riverRunoff += worked.riverRunoff;
    const lived = live(state, worked.city);
    const checked = checkGoals(lived);
    cities[id] = checked.city;
    events.push(...checked.events);
  }

  // Pollution from riverside cities drifts into the river; then it slowly clears.
  const river = commons.river;
  const drift = citiesBordering("river").reduce(
    (sum, id) => sum + (cities[id]?.pollution ?? 0) * RIVER_DRIFT,
    0,
  );
  const riverDecay =
    RIVER_DECAY * (state.policies.includes("river-protection") ? 2 : 1);
  river.pollution = round3(
    Math.max(river.pollution * (1 - riverDecay) + drift + riverRunoff, 0),
  );

  for (const id of COMMONS_IDS) {
    const current = commons[id];
    const neighbors = citiesBordering(id).filter((cityId) => cities[cityId]);
    const avgPollution =
      neighbors.reduce(
        (sum, cityId) => sum + (cities[cityId]?.pollution ?? 0),
        0,
      ) / Math.max(neighbors.length, 1);
    const health =
      id === "river"
        ? Math.max(1 - current.pollution / 40, 0)
        : Math.max(1 - avgPollution / 60, 0) *
          (state.policies.includes("forest-reserve") ? 2 : 1);

    let collapsed = false;
    let recovered = true;
    for (const [stock, def] of Object.entries(COMMONS[id].stocks)) {
      const s = current.stocks[stock] ?? 0;
      // Logistic regrowth, plus a trickle so an emptied stock can come back.
      const regrown =
        s + def.regrowth * s * (1 - s / def.cap) * health + def.cap * 0.002;
      const next = round3(Math.min(Math.max(regrown, 0), def.cap));
      current.stocks[stock] = next;
      if (next < def.cap * COLLAPSED) collapsed = true;
      if (next < def.cap * RECOVERED) recovered = false;
    }
    if (!current.collapsed && collapsed) {
      current.collapsed = true;
      events.push({ type: "commons.collapsed", payload: { commons: id } });
    } else if (current.collapsed && recovered) {
      current.collapsed = false;
      events.push({ type: "commons.recovered", payload: { commons: id } });
    }
  }

  const market = { ...state.market };
  for (const good of GOODS) {
    market[good] = round3(
      market[good] + (MARKET.target - market[good]) * MARKET.restock,
    );
  }

  const tick = state.tick + 1;
  let regionHistory = state.regionHistory;
  if (tick % HISTORY_EVERY === 0) {
    for (const id of state.cityIds) {
      const city = cities[id];
      if (!city) continue;
      cities[id] = {
        ...city,
        history: [
          ...city.history,
          {
            tick,
            population: city.population,
            happiness: Math.round(city.happiness),
            pollution: Math.round(city.pollution * 10) / 10,
          },
        ].slice(-HISTORY_LENGTH),
      };
    }
    regionHistory = [
      ...regionHistory,
      { tick, health: regionHealth({ ...state, commons }) },
    ].slice(-HISTORY_LENGTH);
  }
  const offers = state.offers.map((offer) =>
    offer.status === "open" &&
    tick - offer.createdTick >= TRADE.expiresAfterTicks
      ? { ...offer, status: "expired" as const }
      : offer,
  );

  return {
    ok: true,
    state: {
      ...state,
      tick,
      cities,
      commons,
      market,
      offers,
      regionHistory,
      events: state.events.filter((event) => event.untilTick > tick),
    },
    events,
  };
}

// Runs each workplace in build order until the city runs out of workers.
// Mutates only `commons` (a fresh copy made by runTick).
function work(
  state: IdleState,
  city: CityState,
  commons: Record<CommonsId, CommonsState>,
): { city: CityState; riverRunoff: number } {
  let workersLeft = city.population;
  let pollution = 0;
  let riverRunoff = 0;
  const goods = { ...city.goods };

  // Adds a building's output to the city's goods (up to storage) and
  // returns what actually fit, for the popups.
  const produce = (output: Partial<Record<Good, number>>) => {
    const made: Partial<Record<Good, number>> = {};
    for (const [good, amount] of Object.entries(output) as [Good, number][]) {
      const before = goods[good];
      goods[good] = round3(Math.min(before + amount, STORAGE_CAP));
      made[good] = round3(goods[good] - before);
    }
    return made;
  };

  const buildings = city.buildings.map((building): Building => {
    const def = BUILDINGS[building.kind];
    // Homes, parks and the hall need no workers; the hall's garden still grows.
    if (!def.workers) {
      const lastOutput = def.output
        ? produce(buildingRates(state, building).output)
        : {};
      return { ...building, status: "ok", lastOutput };
    }
    if (!building.running)
      return { ...building, status: "stopped", lastOutput: {} };
    if (workersLeft < def.workers)
      return { ...building, status: "no-workers", lastOutput: {} };

    const rates = buildingRates(state, building);
    if (rates.takes) {
      const source = commons[rates.takes.commons];
      const have = source.stocks[rates.takes.stock] ?? 0;
      if (source.collapsed || have < rates.takes.amount) {
        return { ...building, status: "commons-empty", lastOutput: {} };
      }
      source.stocks[rates.takes.stock] = round3(have - rates.takes.amount);
    }

    workersLeft -= def.workers;
    pollution += rates.pollution;
    riverRunoff += rates.riverPollution;
    return { ...building, status: "ok", lastOutput: produce(rates.output) };
  });

  const cleaned = Math.max(
    city.pollution * (1 - POLLUTION_DECAY) + pollution - parkCleaning(city),
    0,
  );
  return {
    city: { ...city, goods, buildings, pollution: round3(cleaned) },
    riverRunoff,
  };
}

// People eat, pay taxes, move in or out, and their mood shifts.
function live(state: IdleState, city: CityState): CityState {
  const goods = { ...city.goods };
  const appetite = city.population * FOOD_PER_PERSON;
  const starving = goods.food < appetite;
  goods.food = round3(Math.max(goods.food - appetite, 0));

  const coins = round3(
    city.coins + city.population * (city.happiness / 100) * TAX_PER_PERSON,
  );

  let growth = city.growth;
  if (starving) {
    growth -= STARVE_RATE;
  } else if (
    city.population < housing(city) &&
    city.happiness >= GROWTH_MIN_HAPPINESS
  ) {
    growth += GROWTH_RATE;
  } else if (city.happiness < 20) {
    growth -= GROWTH_RATE;
  }
  let population = city.population;
  if (growth >= 1) {
    population += 1;
    growth = 0;
  } else if (growth <= -1) {
    population = Math.max(population - 1, 1);
    growth = 0;
  }

  const fed = { ...city, goods, coins, population, growth: round3(growth) };
  const target = targetHappiness(state, fed);
  const happiness = round3(
    city.happiness + (target - city.happiness) * HAPPINESS_EASE,
  );
  return { ...fed, happiness };
}
