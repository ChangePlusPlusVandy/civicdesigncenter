// Every number in the game lives here so it can be tuned in one place.
// One tick is one production step; the server runs a tick every 2 seconds at
// speed ×1, so a 5-minute season is about 150 ticks.

import type { TileKind } from "./map.ts";

export type Good = "food" | "wood" | "clay" | "copper";

export const GOODS: readonly Good[] = ["food", "wood", "clay", "copper"];

export const GOOD_INFO: Record<
  Good,
  { name: string; icon: string; use: string }
> = {
  food: {
    name: "Food",
    icon: "🌾",
    use: "Feeds your people so the city can grow.",
  },
  wood: { name: "Wood", icon: "🪵", use: "Used to build almost everything." },
  clay: {
    name: "Clay",
    icon: "🧱",
    use: "Makes bricks for homes and upgrades.",
  },
  copper: {
    name: "Copper",
    icon: "🔶",
    use: "Needed to upgrade buildings to level 2 and 3.",
  },
};

// Coins plus goods. Used for prices, payments and trade offers.
export type Bundle = Partial<Record<Good | "coins", number>>;

export type BuildingKind =
  | "hall"
  | "house"
  | "park"
  | "farm"
  | "fishing-dock"
  | "lumber-camp"
  | "hunting-lodge"
  | "clay-pit"
  | "copper-mine";

export type BuildableKind = Exclude<BuildingKind, "hall">;

export interface BuildingDef {
  name: string;
  icon: string;
  blurb: string;
  cost: Bundle;
  // Needs one of these tiles right next to it.
  needs?: TileKind;
  // Per tick, at level 1. Workers come from the city's population.
  workers: number;
  output?: Partial<Record<Good, number>>;
  pollution?: number;
  // Taken from the river or woods next to it each tick.
  takes?: { stock: "fish" | "wood" | "animals"; amount: number };
  // Extra output when this tile kind is next door.
  bonus?: {
    near: TileKind;
    output: Partial<Record<Good, number>>;
    pollution?: number;
    riverPollution?: number;
    text: string;
  };
  housing?: number;
  happiness?: number;
  // Pollution a park cleans up each tick.
  cleans?: number;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hall: {
    name: "Town Hall",
    icon: "🏛️",
    blurb:
      "The heart of your city. Gives homes for 6 people, and its garden grows a little food.",
    cost: {},
    workers: 0,
    // The town garden: enough to feed the first few people while students
    // learn, never enough to grow on.
    output: { food: 0.5 },
    housing: 6,
  },
  house: {
    name: "Houses",
    icon: "🏠",
    blurb: "Homes for 5 more people. More people means more workers and taxes.",
    cost: { wood: 10, clay: 6 },
    workers: 0,
    housing: 5,
  },
  park: {
    name: "Park",
    icon: "🌳",
    blurb: "Makes people happier and cleans up a little pollution.",
    cost: { coins: 30, wood: 6 },
    workers: 0,
    happiness: 8,
    cleans: 0.2,
  },
  farm: {
    name: "Farm",
    icon: "🌾",
    blurb: "Grows food.",
    cost: { coins: 20, wood: 5 },
    workers: 1,
    output: { food: 1 },
    bonus: {
      near: "water",
      output: { food: 0.5 },
      riverPollution: 0.05,
      text: "Next to the river: +50% food, but runoff pollutes the river.",
    },
  },
  "fishing-dock": {
    name: "Fishing Dock",
    icon: "🐟",
    blurb: "Catches fish from the river. Too many docks will empty it!",
    cost: { coins: 25, wood: 8 },
    needs: "water",
    workers: 1,
    output: { food: 1.5 },
    takes: { stock: "fish", amount: 1 },
  },
  "lumber-camp": {
    name: "Lumber Camp",
    icon: "🪓",
    blurb: "Cuts wood from the woods next to it. Forests grow back slowly.",
    cost: { coins: 15 },
    needs: "woods",
    workers: 1,
    output: { wood: 1 },
    takes: { stock: "wood", amount: 1 },
  },
  "hunting-lodge": {
    name: "Hunting Lodge",
    icon: "🦌",
    blurb: "Hunts animals in the woods next to it.",
    cost: { coins: 15, wood: 4 },
    needs: "woods",
    workers: 1,
    output: { food: 1 },
    takes: { stock: "animals", amount: 0.5 },
  },
  "clay-pit": {
    name: "Clay Pit",
    icon: "🧱",
    blurb: "Digs clay. Makes some pollution.",
    cost: { coins: 20, wood: 6 },
    workers: 1,
    output: { clay: 0.8 },
    pollution: 0.3,
    bonus: {
      near: "clay",
      output: { clay: 0.4 },
      pollution: -0.1,
      text: "Next to a clay deposit: more clay and less pollution.",
    },
  },
  "copper-mine": {
    name: "Copper Mine",
    icon: "⛏️",
    blurb: "Mines copper for upgrades. Makes a lot of pollution.",
    cost: { coins: 40, wood: 10, clay: 8 },
    workers: 1,
    output: { copper: 0.4 },
    pollution: 0.6,
    bonus: {
      near: "copper",
      output: { copper: 0.3 },
      pollution: -0.2,
      text: "Next to a copper deposit: more copper and less pollution.",
    },
  },
};

export const BUILDABLE: readonly BuildableKind[] = [
  "farm",
  "fishing-dock",
  "lumber-camp",
  "hunting-lodge",
  "clay-pit",
  "copper-mine",
  "house",
  "park",
];

export const MAX_LEVEL = 3;
// Index by level - 1.
export const LEVEL_OUTPUT = [1, 2, 3];
export const LEVEL_POLLUTION = [1, 1.6, 2.2];
export const LEVEL_HOUSING = [1, 1.8, 2.8];
export const LEVEL_HAPPINESS = [1, 1.5, 2];
export const UPGRADE_COST_FACTOR = [0, 1.5, 2.5];
export const UPGRADE_COPPER = [0, 3, 8];

export const START = {
  coins: 60,
  goods: { food: 20, wood: 20, clay: 10, copper: 0 } satisfies Record<
    Good,
    number
  >,
  population: 4,
  happiness: 60,
};

export const STORAGE_CAP = 150;
export const FOOD_PER_PERSON = 0.1;
export const TAX_PER_PERSON = 0.25;
// Growth progress per tick when people are fed, housed and happy enough.
export const GROWTH_RATE = 0.05;
export const STARVE_RATE = 0.1;
export const GROWTH_MIN_HAPPINESS = 40;
// How quickly happiness moves toward its target each tick.
export const HAPPINESS_EASE = 0.1;
export const POLLUTION_DECAY = 0.05;
// Share of a riverside city's pollution that drifts into the river each tick.
export const RIVER_DRIFT = 0.02;
export const RIVER_DECAY = 0.03;

export interface CommonsDef {
  stocks: Record<string, { start: number; cap: number; regrowth: number }>;
}

// Regrowth is logistic: fastest when half full, zero when empty or full.
// Pollution slows it. The most a commons can give forever is
// regrowth × cap / 4 per tick (2.5 fish, or 3 wood per forest).
export const COMMONS: Record<"river" | "westWoods" | "eastWoods", CommonsDef> =
  {
    river: { stocks: { fish: { start: 150, cap: 200, regrowth: 0.05 } } },
    westWoods: {
      stocks: {
        wood: { start: 250, cap: 300, regrowth: 0.04 },
        animals: { start: 50, cap: 60, regrowth: 0.05 },
      },
    },
    eastWoods: {
      stocks: {
        wood: { start: 250, cap: 300, regrowth: 0.04 },
        animals: { start: 50, cap: 60, regrowth: 0.05 },
      },
    },
  };

// Below this share of its cap, a stock has collapsed: nothing can be taken
// until it recovers past RECOVERED.
export const COLLAPSED = 0.05;
export const RECOVERED = 0.2;

export const MARKET = {
  base: { food: 2, wood: 2, clay: 3, copper: 8 } satisfies Record<Good, number>,
  target: 100,
  fee: 0.1,
  maxPerOrder: 20,
  // Share of the gap to `target` the market stock closes each tick.
  restock: 0.01,
};

export const TRADE = { maxOpenPerCity: 5, expiresAfterTicks: 90 };

export type PolicyId =
  | "river-protection"
  | "clean-air"
  | "forest-reserve"
  | "park-fund"
  | "free-trade";

export const POLICIES: Record<PolicyId, { name: string; summary: string }> = {
  "river-protection": {
    name: "River Protection",
    summary:
      "Fishing docks catch half as much, and the river cleans itself twice as fast.",
  },
  "clean-air": {
    name: "Clean Air Act",
    summary: "Mines and clay pits make half the pollution, but 25% less stuff.",
  },
  "forest-reserve": {
    name: "Forest Reserve",
    summary:
      "Lumber camps and hunting lodges take half as much, and the woods grow back twice as fast.",
  },
  "park-fund": {
    name: "Shared Park Fund",
    summary:
      "Every city pays 20 coins once, and every city gets +10 happiness.",
  },
  "free-trade": {
    name: "Free Trade",
    summary: "The market stops charging a fee on buying and selling.",
  },
};

export type EventKind = "drought" | "festival" | "flood";

export const EVENTS: Record<
  EventKind,
  { name: string; summary: string; ticks: number }
> = {
  drought: {
    name: "Drought",
    summary: "Farms grow half as much food for a while.",
    ticks: 45,
  },
  festival: {
    name: "Festival",
    summary: "Every city is +15 happier for a while.",
    ticks: 45,
  },
  flood: {
    name: "Flood",
    summary:
      "The flood washes the river clean, but riverside cities lose 10 food.",
    ticks: 1,
  },
};

export type GoalId =
  | "first-farm"
  | "ten-people"
  | "twenty-people"
  | "first-park"
  | "level-three"
  | "first-trade"
  | "happy-city"
  | "clean-city";

export const GOALS: Record<GoalId, { name: string; hint: string }> = {
  "first-farm": { name: "First Harvest", hint: "Build a farm." },
  "ten-people": { name: "Growing Town", hint: "Reach 10 people." },
  "twenty-people": { name: "Bustling City", hint: "Reach 20 people." },
  "first-park": { name: "Green Space", hint: "Build a park." },
  "level-three": {
    name: "Master Builder",
    hint: "Upgrade a building to level 3.",
  },
  "first-trade": {
    name: "Deal Maker",
    hint: "Complete a trade with another city.",
  },
  "happy-city": { name: "Joyful City", hint: "Reach 80 happiness." },
  "clean-city": {
    name: "Clean Machine",
    hint: "Have 6+ buildings with pollution under 5.",
  },
};

// City and region trends for the charts: a sample every few ticks, the
// most recent ones kept.
export const HISTORY_EVERY = 5;
export const HISTORY_LENGTH = 60;

export const REFLECTION_MAX_LENGTH = 400;
export const MAX_REFLECTIONS = 500;

// Asked on the season report. Rotates by season.
export const REFLECTION_PROMPTS = [
  "What changed in the river and woods this season? Why do you think it happened?",
  "Did your city's choices help or hurt the other cities? How?",
  "If you could make one rule for every city, what would it be, and why?",
  "What would you tell a new city to do first, and why?",
];

export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
export const TICK_MS = 2000;
