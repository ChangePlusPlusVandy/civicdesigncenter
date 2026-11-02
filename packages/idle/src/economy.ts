// Pure calculations shared by the rules, the projections and the UI.

import {
  BUILDINGS,
  COMMONS,
  GOODS,
  LEVEL_HAPPINESS,
  LEVEL_HOUSING,
  LEVEL_OUTPUT,
  LEVEL_POLLUTION,
  MARKET,
  MAX_LEVEL,
  STORAGE_CAP,
  UPGRADE_COPPER,
  UPGRADE_COST_FACTOR,
  type BuildableKind,
  type BuildingKind,
  type Bundle,
  type Good,
} from "./content.ts";
import {
  citiesBordering,
  cityAt,
  cityInfo,
  neighborOfKind,
  neighbors,
  tileAt,
  type CommonsId,
} from "./map.ts";
import type { Building, CityState, IdleState, RuleError } from "./types.ts";

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function level(table: number[], lvl: number): number {
  return table[Math.min(Math.max(lvl, 1), MAX_LEVEL) - 1] ?? 1;
}

export function upgradeCost(kind: BuildableKind, toLevel: number): Bundle {
  const factor = UPGRADE_COST_FACTOR[toLevel - 1] ?? 0;
  const cost: Bundle = {};
  for (const [key, amount] of Object.entries(BUILDINGS[kind].cost)) {
    cost[key as keyof Bundle] = Math.ceil((amount ?? 0) * factor);
  }
  cost.copper = (cost.copper ?? 0) + (UPGRADE_COPPER[toLevel - 1] ?? 0);
  return cost;
}

export function canAfford(
  city: Pick<CityState, "coins" | "goods">,
  cost: Bundle,
): boolean {
  return Object.entries(cost).every(([key, amount]) =>
    key === "coins"
      ? city.coins >= (amount ?? 0)
      : city.goods[key as Good] >= (amount ?? 0),
  );
}

export function missing(
  city: Pick<CityState, "coins" | "goods">,
  cost: Bundle,
): string {
  return Object.entries(cost)
    .filter(([key, amount]) =>
      key === "coins"
        ? city.coins < (amount ?? 0)
        : city.goods[key as Good] < (amount ?? 0),
    )
    .map(([key]) => key)
    .join(" and ");
}

// Returns a new city with `bundle` added (sign = 1) or removed (sign = -1).
// Goods never go over the storage cap.
export function applyBundle(
  city: CityState,
  bundle: Bundle,
  sign: 1 | -1,
): CityState {
  const goods = { ...city.goods };
  let coins = city.coins;
  for (const [key, amount] of Object.entries(bundle)) {
    if (!amount) continue;
    if (key === "coins") {
      coins = round3(coins + sign * amount);
    } else {
      const good = key as Good;
      goods[good] = round3(Math.min(goods[good] + sign * amount, STORAGE_CAP));
    }
  }
  return { ...city, coins, goods };
}

export function isBundle(value: unknown): value is Bundle {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).every(
    ([key, amount]) =>
      (key === "coins" || (GOODS as string[]).includes(key)) &&
      Number.isInteger(amount) &&
      (amount as number) >= 0,
  );
}

export function bundleIsEmpty(bundle: Bundle): boolean {
  return Object.values(bundle).every((amount) => !amount);
}

// The commons a building draws from or pollutes: the first neighboring tile
// that belongs to one.
export function commonsNextTo(x: number, y: number): CommonsId | undefined {
  return neighbors(x, y).find((tile) => tile.commons)?.commons;
}

// Whether a building of this kind would get its terrain bonus at (x, y).
export function hasBonusAt(kind: BuildingKind, x: number, y: number): boolean {
  const near = BUILDINGS[kind].bonus?.near;
  return near ? neighborOfKind(x, y, near) !== undefined : false;
}

export interface Rates {
  output: Partial<Record<Good, number>>;
  pollution: number;
  riverPollution: number;
  takes?: { commons: CommonsId; stock: string; amount: number };
  bonusActive: boolean;
}

// What a running building makes per tick, after its level, bonus, the
// passed policies and any active event.
export function buildingRates(state: IdleState, building: Building): Rates {
  const def = BUILDINGS[building.kind];
  const outputScale = level(LEVEL_OUTPUT, building.level);
  const pollutionScale = level(LEVEL_POLLUTION, building.level);
  const bonusActive = hasBonusAt(building.kind, building.x, building.y);

  let outputFactor = outputScale;
  let pollutionFactor = pollutionScale;
  let takeFactor = outputScale;
  const has = (policy: string) => state.policies.includes(policy as never);

  if (building.kind === "fishing-dock" && has("river-protection")) {
    outputFactor *= 0.5;
    takeFactor *= 0.5;
  }
  if (
    (building.kind === "clay-pit" || building.kind === "copper-mine") &&
    has("clean-air")
  ) {
    outputFactor *= 0.75;
    pollutionFactor *= 0.5;
  }
  if (
    (building.kind === "lumber-camp" || building.kind === "hunting-lodge") &&
    has("forest-reserve")
  ) {
    outputFactor *= 0.5;
    takeFactor *= 0.5;
  }
  if (
    building.kind === "farm" &&
    state.events.some((event) => event.kind === "drought")
  ) {
    outputFactor *= 0.5;
  }

  const output: Partial<Record<Good, number>> = {};
  for (const good of GOODS) {
    const base =
      (def.output?.[good] ?? 0) +
      (bonusActive ? (def.bonus?.output[good] ?? 0) : 0);
    if (base) output[good] = round3(base * outputFactor);
  }

  const pollution = round3(
    Math.max(
      ((def.pollution ?? 0) + (bonusActive ? (def.bonus?.pollution ?? 0) : 0)) *
        pollutionFactor,
      0,
    ),
  );
  const riverPollution = bonusActive
    ? round3((def.bonus?.riverPollution ?? 0) * pollutionScale)
    : 0;

  let takes: Rates["takes"];
  if (def.takes) {
    const commons = neighbors(building.x, building.y).find(
      (tile) =>
        tile.commons &&
        COMMONS[tile.commons].stocks[def.takes?.stock ?? ""] !== undefined,
    )?.commons;
    if (commons) {
      takes = {
        commons,
        stock: def.takes.stock,
        amount: round3(def.takes.amount * takeFactor),
      };
    }
  }

  return { output, pollution, riverPollution, takes, bonusActive };
}

export function housing(city: CityState): number {
  return city.buildings.reduce(
    (sum, building) =>
      sum +
      Math.round(
        (BUILDINGS[building.kind].housing ?? 0) *
          level(LEVEL_HOUSING, building.level),
      ),
    0,
  );
}

export function jobs(city: CityState): number {
  return city.buildings.reduce(
    (sum, building) => sum + BUILDINGS[building.kind].workers,
    0,
  );
}

export function parkHappiness(city: CityState): number {
  return city.buildings.reduce(
    (sum, building) =>
      sum +
      (BUILDINGS[building.kind].happiness ?? 0) *
        level(LEVEL_HAPPINESS, building.level),
    0,
  );
}

export function parkCleaning(city: CityState): number {
  return city.buildings.reduce(
    (sum, building) =>
      sum +
      (BUILDINGS[building.kind].cleans ?? 0) *
        level(LEVEL_HAPPINESS, building.level),
    0,
  );
}

export interface Factor {
  label: string;
  value: number;
}

// Happiness is a visible list of reasons, never a hidden formula.
export function happinessFactors(state: IdleState, city: CityState): Factor[] {
  const factors: Factor[] = [{ label: "Base", value: 50 }];

  if (city.goods.food < 1) {
    factors.push({ label: "Not enough food", value: -25 });
  } else if (city.goods.food >= city.population) {
    factors.push({ label: "Plenty of food", value: 10 });
  }

  const parks = Math.min(Math.round(parkHappiness(city)), 30);
  if (parks) factors.push({ label: "Parks", value: parks });

  const pollution = Math.min(Math.round(city.pollution), 40);
  if (pollution) factors.push({ label: "Pollution", value: -pollution });

  if (city.population >= housing(city)) {
    factors.push({ label: "Crowded homes", value: -10 });
  }
  if (city.population - jobs(city) >= 4) {
    factors.push({ label: "People need jobs", value: -5 });
  }
  if (state.events.some((event) => event.kind === "festival")) {
    factors.push({ label: "Festival", value: 15 });
  }
  if (state.policies.includes("park-fund")) {
    factors.push({ label: "Shared Park Fund", value: 10 });
  }

  for (const commons of ["river", "westWoods", "eastWoods"] as const) {
    if (
      state.commons[commons].collapsed &&
      citiesBordering(commons).includes(city.id)
    ) {
      factors.push({
        label:
          commons === "river" ? "The river is dying" : "The woods are gone",
        value: -10,
      });
    }
  }
  if (regionHealth(state) < 25) {
    factors.push({ label: "Nature in crisis", value: -10 });
  }

  return factors;
}

export function targetHappiness(state: IdleState, city: CityState): number {
  const total = happinessFactors(state, city).reduce(
    (sum, factor) => sum + factor.value,
    0,
  );
  return Math.min(Math.max(total, 0), 100);
}

export function marketPrice(
  state: IdleState,
  good: Good,
): { buy: number; sell: number } {
  const stock = Math.max(state.market[good], 1);
  const scarcity = Math.min(Math.max(Math.sqrt(MARKET.target / stock), 0.4), 3);
  const price = MARKET.base[good] * scarcity;
  const fee = state.policies.includes("free-trade") ? 0 : MARKET.fee;
  return {
    buy: Math.max(Math.ceil(price * (1 + fee)), 1),
    sell: Math.max(Math.floor(price * (1 - fee)), 1),
  };
}

export function commonsHealth(state: IdleState, id: CommonsId): number {
  const stocks = COMMONS[id].stocks;
  const shares = Object.entries(stocks).map(
    ([stock, def]) => (state.commons[id].stocks[stock] ?? 0) / def.cap,
  );
  const fullness =
    shares.reduce((sum, share) => sum + share, 0) / shares.length;
  const clean =
    id === "river" ? 1 - Math.min(state.commons.river.pollution / 40, 1) : 1;
  return Math.round(fullness * clean * 100);
}

export function regionHealth(state: IdleState): number {
  const ids: CommonsId[] = ["river", "westWoods", "eastWoods"];
  return Math.round(
    ids.reduce((sum, id) => sum + commonsHealth(state, id), 0) / ids.length,
  );
}

// Only needs the building city's own data, so the browser can run the same
// check the server does before a student taps a tile.
export type BuildingCity = Pick<
  CityState,
  "id" | "coins" | "goods" | "buildings"
>;

export function placementProblem(
  city: BuildingCity,
  kind: BuildableKind,
  x: number,
  y: number,
): RuleError | null {
  const def = BUILDINGS[kind];
  if (!tileAt(x, y))
    return { code: "BAD_REQUEST", message: "That's off the map." };

  const owner = cityAt(x, y);
  if (!owner) {
    return {
      code: "NOT_YOUR_LAND",
      message: "You can only build inside your city's fence.",
    };
  }
  if (owner.id !== city.id) {
    return {
      code: "NOT_YOUR_LAND",
      message: `That land belongs to ${cityInfo(owner.id).name}.`,
    };
  }
  if (city.buildings.some((building) => building.x === x && building.y === y)) {
    return { code: "OCCUPIED", message: "Something is already built there." };
  }
  if (def.needs && !neighborOfKind(x, y, def.needs)) {
    const place = def.needs === "water" ? "the river" : "woods";
    return {
      code: "NEEDS_NEIGHBOR",
      message: `A ${def.name} has to be right next to ${place}.`,
    };
  }
  if (!canAfford(city, def.cost)) {
    return {
      code: "CANT_AFFORD",
      message: `You need more ${missing(city, def.cost)}.`,
    };
  }
  return null;
}
