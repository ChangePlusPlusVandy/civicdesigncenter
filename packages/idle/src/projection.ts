// What each audience may see. Players see their own city in full and other
// cities' public faces; coins and goods stay private so trades need talking.

import {
  FOOD_PER_PERSON,
  GOODS,
  POLICIES,
  TAX_PER_PERSON,
  type Good,
  type PolicyId,
} from "./content.ts";
import {
  commonsHealth,
  happinessFactors,
  housing,
  jobs,
  marketPrice,
  regionHealth,
  type Factor,
} from "./economy.ts";
import { CITIES, COMMONS_NAMES, type CityId, type CommonsId } from "./map.ts";
import type {
  ActiveEvent,
  Building,
  CityState,
  IdleState,
  MeetingResult,
  Phase,
  SeasonReport,
  TradeOffer,
} from "./types.ts";

export type Audience =
  | { kind: "player"; cityId: CityId; playerId: string; name: string }
  | { kind: "teacher" }
  | { kind: "projector" };

export interface PublicCity {
  id: CityId;
  name: string;
  color: string;
  population: number;
  happiness: number;
  pollution: number;
  buildings: Building[];
  tradesCompleted: number;
  goalCount: number;
  players: string[];
}

export interface PrivateCity extends PublicCity {
  coins: number;
  goods: Record<Good, number>;
  growth: number;
  housing: number;
  jobs: number;
  // Per tick, from the last tick's production, food eaten and taxes.
  income: Record<Good | "coins", number>;
  happinessFactors: Factor[];
  goals: CityState["goals"];
  lastReport: SeasonReport | null;
}

export interface CommonsView {
  id: CommonsId;
  name: string;
  stocks: Record<string, number>;
  pollution: number;
  collapsed: boolean;
  health: number;
}

export interface MeetingView {
  policyIds: PolicyId[];
  votedCities: CityId[];
  myVotes?: Partial<Record<PolicyId, boolean>>;
  // Teacher only, live.
  votes?: Partial<Record<CityId, Partial<Record<PolicyId, boolean>>>>;
}

export interface Leaderboard {
  id: "biggest" | "happiest" | "greenest" | "trader";
  title: string;
  ranking: { cityId: CityId; value: number }[];
}

export interface RosterEntry {
  playerId: string;
  name: string;
  cityId: CityId;
}

export interface Projection {
  version: number;
  audience: Audience["kind"];
  me: { playerId: string; name: string; cityId: CityId } | null;
  tick: number;
  season: number;
  phase: Phase;
  speed: number;
  cities: PublicCity[];
  myCity: PrivateCity | null;
  // Teacher only.
  allCities: PrivateCity[] | null;
  roster: RosterEntry[] | null;
  commons: CommonsView[];
  regionHealth: number;
  market: Record<Good, { stock: number; buy: number; sell: number }>;
  offers: TradeOffer[];
  meeting: MeetingView | null;
  meetingResults: MeetingResult[];
  policies: PolicyId[];
  availablePolicies: PolicyId[];
  events: ActiveEvent[];
  leaderboards: Leaderboard[];
}

function publicCity(city: CityState, players: string[]): PublicCity {
  const info = CITIES.find((c) => c.id === city.id);
  return {
    id: city.id,
    name: info?.name ?? city.id,
    color: info?.color ?? "#888888",
    population: city.population,
    happiness: Math.round(city.happiness),
    pollution: Math.round(city.pollution * 10) / 10,
    buildings: city.buildings,
    tradesCompleted: city.tradesCompleted,
    goalCount: city.goals.length,
    players,
  };
}

function privateCity(
  state: IdleState,
  city: CityState,
  players: string[],
): PrivateCity {
  const income = Object.fromEntries(GOODS.map((good) => [good, 0])) as Record<
    Good | "coins",
    number
  >;
  for (const building of city.buildings) {
    for (const [good, amount] of Object.entries(building.lastOutput) as [
      Good,
      number,
    ][]) {
      income[good] += amount;
    }
  }
  income.food -= city.population * FOOD_PER_PERSON;
  income.coins = city.population * (city.happiness / 100) * TAX_PER_PERSON;
  for (const key of Object.keys(income) as (Good | "coins")[]) {
    income[key] = Math.round(income[key] * 100) / 100;
  }

  return {
    ...publicCity(city, players),
    coins: city.coins,
    goods: city.goods,
    growth: city.growth,
    housing: housing(city),
    jobs: jobs(city),
    income,
    happinessFactors: happinessFactors(state, city),
    goals: city.goals,
    lastReport: city.lastReport,
  };
}

function leaderboards(cities: PublicCity[]): Leaderboard[] {
  const rank = (
    id: Leaderboard["id"],
    title: string,
    value: (city: PublicCity) => number,
  ): Leaderboard => ({
    id,
    title,
    ranking: cities
      .map((city) => ({ cityId: city.id, value: value(city) }))
      .sort((a, b) => b.value - a.value),
  });
  return [
    rank("biggest", "Biggest", (c) => c.population),
    rank("happiest", "Happiest", (c) => c.happiness),
    rank("greenest", "Greenest", (c) =>
      Math.max(Math.round(100 - c.pollution * 2), 0),
    ),
    rank("trader", "Best Trader", (c) => c.tradesCompleted),
  ];
}

export function project(
  state: IdleState,
  audience: Audience,
  version: number,
  players: RosterEntry[],
): Projection {
  const playersByCity: Partial<Record<CityId, string[]>> = {};
  for (const player of players) {
    (playersByCity[player.cityId] ??= []).push(player.name);
  }
  const cityStates = state.cityIds
    .map((id) => state.cities[id])
    .filter((city): city is CityState => city !== undefined);
  const cities = cityStates.map((city) =>
    publicCity(city, playersByCity[city.id] ?? []),
  );

  const mine =
    audience.kind === "player" ? state.cities[audience.cityId] : undefined;
  const market = Object.fromEntries(
    GOODS.map((good) => [
      good,
      { stock: Math.floor(state.market[good]), ...marketPrice(state, good) },
    ]),
  ) as Projection["market"];

  let meeting: MeetingView | null = null;
  if (state.meeting) {
    meeting = {
      policyIds: state.meeting.policyIds,
      votedCities: (Object.keys(state.meeting.votes) as CityId[]).filter(
        (id) => Object.keys(state.meeting?.votes[id] ?? {}).length > 0,
      ),
    };
    if (audience.kind === "player")
      meeting.myVotes = state.meeting.votes[audience.cityId] ?? {};
    if (audience.kind === "teacher") meeting.votes = state.meeting.votes;
  }

  return {
    version,
    audience: audience.kind,
    me:
      audience.kind === "player"
        ? {
            playerId: audience.playerId,
            name: audience.name,
            cityId: audience.cityId,
          }
        : null,
    tick: state.tick,
    season: state.season,
    phase: state.phase,
    speed: state.speed,
    cities,
    myCity: mine
      ? privateCity(state, mine, playersByCity[mine.id] ?? [])
      : null,
    allCities:
      audience.kind === "teacher"
        ? cityStates.map((city) =>
            privateCity(state, city, playersByCity[city.id] ?? []),
          )
        : null,
    roster: audience.kind === "teacher" ? players : null,
    commons: (Object.keys(state.commons) as CommonsId[]).map((id) => ({
      id,
      name: COMMONS_NAMES[id],
      stocks: Object.fromEntries(
        Object.entries(state.commons[id].stocks).map(([k, v]) => [
          k,
          Math.floor(v),
        ]),
      ),
      pollution: Math.round(state.commons[id].pollution * 10) / 10,
      collapsed: state.commons[id].collapsed,
      health: commonsHealth(state, id),
    })),
    regionHealth: regionHealth(state),
    market,
    offers:
      audience.kind === "teacher"
        ? state.offers
        : audience.kind === "player"
          ? state.offers.filter(
              (o) => o.from === audience.cityId || o.to === audience.cityId,
            )
          : [],
    meeting,
    meetingResults: state.meetingResults,
    policies: state.policies,
    availablePolicies: (Object.keys(POLICIES) as PolicyId[]).filter(
      (id) => !state.policies.includes(id),
    ),
    events: state.events,
    leaderboards: leaderboards(cities),
  };
}
