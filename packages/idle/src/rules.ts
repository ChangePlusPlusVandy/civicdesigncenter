// reduce(state, actor, intent) -> next state + events, or a RuleError and no
// change. Deterministic and pure: no randomness, no clock, never mutates.

import {
  BUILDINGS,
  BUILDABLE,
  COMMONS,
  EVENTS,
  GOODS,
  MARKET,
  MAX_LEVEL,
  POLICIES,
  SPEEDS,
  START,
  STORAGE_CAP,
  TRADE,
  type BuildableKind,
  type Bundle,
  type EventKind,
  type Good,
  type PolicyId,
} from "./content.ts";
import {
  applyBundle,
  bundleIsEmpty,
  canAfford,
  commonsHealth,
  isBundle,
  marketPrice,
  missing,
  placementProblem,
  round3,
  upgradeCost,
} from "./economy.ts";
import { checkGoals } from "./goals.ts";
import {
  CITIES,
  citiesBordering,
  cityInfo,
  type CityId,
  type CommonsId,
} from "./map.ts";
import { runTick } from "./tick.ts";
import type {
  Actor,
  Building,
  CityState,
  GameEvent,
  IdleState,
  Intent,
  MeetingResult,
  Phase,
  PlayerIntent,
  ReduceResult,
  RuleError,
  SeasonSnapshot,
} from "./types.ts";

export function createGame(cityCount = 5): IdleState {
  const cityIds = CITIES.slice(0, Math.min(Math.max(cityCount, 2), 5)).map(
    (city) => city.id,
  );
  const cities: IdleState["cities"] = {};
  for (const id of cityIds) {
    const { hall } = cityInfo(id);
    const city: CityState = {
      id,
      coins: START.coins,
      goods: { ...START.goods },
      population: START.population,
      growth: 0,
      happiness: START.happiness,
      pollution: 0,
      buildings: [
        {
          id: `${id}-hall`,
          kind: "hall",
          x: hall.x,
          y: hall.y,
          level: 1,
          running: true,
          status: "ok",
          lastOutput: {},
        },
      ],
      goals: [],
      tradesCompleted: 0,
      seasonStart: { population: 0, coins: 0, happiness: 0, pollution: 0 },
      lastReport: null,
    };
    cities[id] = { ...city, seasonStart: snapshot(city) };
  }

  const commons = {} as IdleState["commons"];
  for (const [id, def] of Object.entries(COMMONS)) {
    commons[id as keyof typeof COMMONS] = {
      stocks: Object.fromEntries(
        Object.entries(def.stocks).map(([stock, s]) => [stock, s.start]),
      ),
      pollution: 0,
      collapsed: false,
    };
  }

  const state: IdleState = {
    tick: 0,
    season: 1,
    phase: "lobby",
    speed: 1,
    cityIds,
    cities,
    commons,
    market: Object.fromEntries(
      GOODS.map((good) => [good, MARKET.target]),
    ) as Record<Good, number>,
    offers: [],
    nextId: 1,
    meeting: null,
    meetingResults: [],
    policies: [],
    events: [],
    seasonStartHealth: { river: 0, westWoods: 0, eastWoods: 0 },
  };
  return { ...state, seasonStartHealth: healthSnapshot(state) };
}

function healthSnapshot(state: IdleState): Record<CommonsId, number> {
  return {
    river: commonsHealth(state, "river"),
    westWoods: commonsHealth(state, "westWoods"),
    eastWoods: commonsHealth(state, "eastWoods"),
  };
}

export function snapshot(city: CityState): SeasonSnapshot {
  return {
    population: city.population,
    coins: Math.floor(city.coins),
    happiness: Math.round(city.happiness),
    pollution: Math.round(city.pollution),
  };
}

const fail = (code: RuleError["code"], message: string): ReduceResult => ({
  ok: false,
  error: { code, message },
});

function ok(state: IdleState, events: GameEvent[]): ReduceResult {
  return { ok: true, state, events };
}

function withCity(state: IdleState, city: CityState): IdleState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}

function isWhole(amount: unknown, max = Infinity): amount is number {
  return (
    Number.isInteger(amount) &&
    (amount as number) >= 1 &&
    (amount as number) <= max
  );
}

// Players may vote only during a meeting; everything else needs the game
// to be running.
const PLAYER_INTENTS: Record<PlayerIntent["type"], Phase> = {
  build: "running",
  upgrade: "running",
  demolish: "running",
  toggle: "running",
  marketBuy: "running",
  marketSell: "running",
  proposeTrade: "running",
  acceptTrade: "running",
  declineTrade: "running",
  cancelTrade: "running",
  vote: "meeting",
};

export function reduce(
  state: IdleState,
  actor: Actor,
  intent: Intent,
): ReduceResult {
  if (intent.type === "tick") {
    if (actor.kind !== "system")
      return fail("NOT_ALLOWED", "Only the server ticks.");
    if (state.phase !== "running")
      return fail("WRONG_PHASE", "The game isn't running.");
    return runTick(state);
  }

  if (actor.kind === "teacher") return teacherAction(state, intent);
  if (actor.kind !== "player") return fail("NOT_ALLOWED", "Unknown actor.");

  const city = state.cities[actor.cityId];
  if (!city) return fail("NOT_FOUND", "Your city isn't in this game.");
  const needed = PLAYER_INTENTS[intent.type as PlayerIntent["type"]];
  if (!needed) return fail("NOT_ALLOWED", `Players can't ${intent.type}.`);
  if (state.phase !== needed) {
    const message =
      state.phase === "meeting"
        ? "The Town Meeting is on. Vote first!"
        : state.phase === "paused"
          ? "The game is paused."
          : state.phase === "lobby"
            ? "The game hasn't started yet."
            : intent.type === "vote"
              ? "There's no Town Meeting right now."
              : "The game is over.";
    return fail("WRONG_PHASE", message);
  }

  switch (intent.type) {
    case "build":
      return build(state, city, intent.payload);
    case "upgrade":
      return upgrade(state, city, intent.payload.buildingId);
    case "demolish":
      return demolish(state, city, intent.payload.buildingId);
    case "toggle":
      return toggle(state, city, intent.payload.buildingId);
    case "marketBuy":
      return marketOrder(
        state,
        city,
        intent.payload.good,
        intent.payload.amount,
        "buy",
      );
    case "marketSell":
      return marketOrder(
        state,
        city,
        intent.payload.good,
        intent.payload.amount,
        "sell",
      );
    case "proposeTrade":
      return proposeTrade(state, city, intent.payload);
    case "acceptTrade":
      return acceptTrade(state, city, intent.payload.offerId);
    case "declineTrade":
    case "cancelTrade":
      return closeTrade(state, city, intent.payload.offerId, intent.type);
    case "vote":
      return vote(state, city, intent.payload.policyId, intent.payload.yes);
  }
  return fail("NOT_ALLOWED", `Players can't ${intent.type}.`);
}

function build(
  state: IdleState,
  city: CityState,
  payload: { kind: BuildableKind; x: number; y: number },
): ReduceResult {
  const { kind, x, y } = payload ?? {};
  if (
    !BUILDABLE.includes(kind) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    return fail("BAD_REQUEST", "Pick a building and a tile.");
  }
  const problem = placementProblem(city, kind, x, y);
  if (problem) return { ok: false, error: problem };

  const building: Building = {
    id: `b${state.nextId}`,
    kind,
    x,
    y,
    level: 1,
    running: true,
    status: "ok",
    lastOutput: {},
  };
  const paid = applyBundle(city, BUILDINGS[kind].cost, -1);
  const next = checkGoals({
    ...paid,
    buildings: [...paid.buildings, building],
  });
  return ok({ ...withCity(state, next.city), nextId: state.nextId + 1 }, [
    {
      type: "building.built",
      city: city.id,
      payload: { building, cost: BUILDINGS[kind].cost },
    },
    ...next.events,
  ]);
}

function findBuilding(city: CityState, id: string) {
  return city.buildings.find((building) => building.id === id);
}

function replaceBuilding(city: CityState, building: Building): CityState {
  return {
    ...city,
    buildings: city.buildings.map((b) => (b.id === building.id ? building : b)),
  };
}

function upgrade(state: IdleState, city: CityState, id: string): ReduceResult {
  const building = findBuilding(city, id);
  if (!building) return fail("NOT_FOUND", "That building isn't yours.");
  if (building.kind === "hall")
    return fail("NOT_ALLOWED", "The Town Hall can't be upgraded yet.");
  if (building.level >= MAX_LEVEL)
    return fail("MAX_LEVEL", "That's already the top level.");

  const cost = upgradeCost(building.kind, building.level + 1);
  if (!canAfford(city, cost)) {
    return fail("CANT_AFFORD", `You need more ${missing(city, cost)}.`);
  }
  const upgraded = { ...building, level: building.level + 1 };
  const next = checkGoals(
    replaceBuilding(applyBundle(city, cost, -1), upgraded),
  );
  return ok(withCity(state, next.city), [
    {
      type: "building.upgraded",
      city: city.id,
      payload: {
        buildingId: id,
        kind: building.kind,
        before: building.level,
        after: upgraded.level,
        cost,
      },
    },
    ...next.events,
  ]);
}

function demolish(state: IdleState, city: CityState, id: string): ReduceResult {
  const building = findBuilding(city, id);
  if (!building) return fail("NOT_FOUND", "That building isn't yours.");
  if (building.kind === "hall")
    return fail("NOT_ALLOWED", "You can't knock down the Town Hall.");
  return ok(
    withCity(state, {
      ...city,
      buildings: city.buildings.filter((b) => b.id !== id),
    }),
    [{ type: "building.demolished", city: city.id, payload: { building } }],
  );
}

function toggle(state: IdleState, city: CityState, id: string): ReduceResult {
  const building = findBuilding(city, id);
  if (!building) return fail("NOT_FOUND", "That building isn't yours.");
  if (!BUILDINGS[building.kind].workers) {
    return fail("NOT_ALLOWED", "Only workplaces can be stopped.");
  }
  const running = !building.running;
  return ok(
    withCity(
      state,
      replaceBuilding(city, {
        ...building,
        running,
        status: running ? "ok" : "stopped",
      }),
    ),
    [
      {
        type: "building.toggled",
        city: city.id,
        payload: { buildingId: id, before: building.running, after: running },
      },
    ],
  );
}

function marketOrder(
  state: IdleState,
  city: CityState,
  good: Good,
  amount: number,
  side: "buy" | "sell",
): ReduceResult {
  if (!GOODS.includes(good) || !isWhole(amount, MARKET.maxPerOrder)) {
    return fail(
      "BAD_REQUEST",
      `Trade between 1 and ${MARKET.maxPerOrder} at a time.`,
    );
  }
  const price = marketPrice(state, good);
  const stock = state.market[good];

  if (side === "buy") {
    const total = price.buy * amount;
    if (stock < amount)
      return fail(
        "SOLD_OUT",
        `The market only has ${Math.floor(stock)} ${good}.`,
      );
    if (city.coins < total)
      return fail("CANT_AFFORD", `That costs ${total} coins.`);
    if (city.goods[good] + amount > STORAGE_CAP)
      return fail("STORAGE_FULL", "Your storage is full.");
    const next = applyBundle(
      applyBundle(city, { coins: total }, -1),
      { [good]: amount },
      1,
    );
    return ok(
      {
        ...withCity(state, next),
        market: { ...state.market, [good]: round3(stock - amount) },
      },
      [
        {
          type: "market.bought",
          city: city.id,
          payload: { good, amount, price: price.buy, total },
        },
      ],
    );
  }

  if (city.goods[good] < amount) {
    return fail(
      "CANT_AFFORD",
      `You only have ${Math.floor(city.goods[good])} ${good}.`,
    );
  }
  const total = price.sell * amount;
  const next = applyBundle(
    applyBundle(city, { [good]: amount }, -1),
    { coins: total },
    1,
  );
  return ok(
    {
      ...withCity(state, next),
      market: { ...state.market, [good]: round3(stock + amount) },
    },
    [
      {
        type: "market.sold",
        city: city.id,
        payload: { good, amount, price: price.sell, total },
      },
    ],
  );
}

function proposeTrade(
  state: IdleState,
  city: CityState,
  payload: { to: CityId; give: Bundle; get: Bundle },
): ReduceResult {
  const { to, give, get } = payload ?? {};
  if (!state.cities[to] || to === city.id)
    return fail("BAD_REQUEST", "Pick another city.");
  if (
    !isBundle(give) ||
    !isBundle(get) ||
    (bundleIsEmpty(give) && bundleIsEmpty(get))
  ) {
    return fail("BAD_REQUEST", "Say what you'll give and what you want.");
  }
  if (!canAfford(city, give))
    return fail(
      "CANT_AFFORD",
      `You don't have that much ${missing(city, give)}.`,
    );
  const open = state.offers.filter(
    (o) => o.from === city.id && o.status === "open",
  );
  if (open.length >= TRADE.maxOpenPerCity) {
    return fail("TOO_MANY_OFFERS", "Cancel an offer before making a new one.");
  }
  const offer = {
    id: `t${state.nextId}`,
    from: city.id,
    to,
    give,
    get,
    createdTick: state.tick,
    status: "open" as const,
  };
  return ok(
    { ...state, offers: [...state.offers, offer], nextId: state.nextId + 1 },
    [{ type: "trade.proposed", city: city.id, payload: { offer } }],
  );
}

function acceptTrade(
  state: IdleState,
  city: CityState,
  offerId: string,
): ReduceResult {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.to !== city.id || offer.status !== "open") {
    return fail("NOT_FOUND", "That offer isn't open anymore.");
  }
  const giver = state.cities[offer.from];
  if (!giver) return fail("NOT_FOUND", "That city left the game.");
  if (!canAfford(giver, offer.give)) {
    return fail(
      "CANT_AFFORD",
      `${cityInfo(giver.id).name} can't pay that anymore.`,
    );
  }
  if (!canAfford(city, offer.get)) {
    return fail("CANT_AFFORD", `You need more ${missing(city, offer.get)}.`);
  }

  const giverAfter = {
    ...applyBundle(applyBundle(giver, offer.give, -1), offer.get, 1),
    tradesCompleted: giver.tradesCompleted + 1,
  };
  const takerAfter = {
    ...applyBundle(applyBundle(city, offer.get, -1), offer.give, 1),
    tradesCompleted: city.tradesCompleted + 1,
  };
  let next: IdleState = {
    ...state,
    cities: { ...state.cities, [giver.id]: giverAfter, [city.id]: takerAfter },
    offers: state.offers.map((o) =>
      o.id === offerId ? { ...o, status: "accepted" as const } : o,
    ),
  };
  const events: GameEvent[] = [
    {
      type: "trade.accepted",
      city: city.id,
      payload: {
        offer,
        fromBefore: { coins: giver.coins, goods: giver.goods },
        toBefore: { coins: city.coins, goods: city.goods },
      },
    },
  ];
  for (const id of [giver.id, city.id]) {
    const checked = checkGoals(next.cities[id] as CityState);
    next = withCity(next, checked.city);
    events.push(...checked.events);
  }
  return ok(next, events);
}

function closeTrade(
  state: IdleState,
  city: CityState,
  offerId: string,
  type: "declineTrade" | "cancelTrade",
): ReduceResult {
  const offer = state.offers.find((o) => o.id === offerId);
  const mine =
    type === "declineTrade" ? offer?.to === city.id : offer?.from === city.id;
  if (!offer || !mine || offer.status !== "open") {
    return fail("NOT_FOUND", "That offer isn't open anymore.");
  }
  const status =
    type === "declineTrade" ? ("declined" as const) : ("cancelled" as const);
  return ok(
    {
      ...state,
      offers: state.offers.map((o) =>
        o.id === offerId ? { ...o, status } : o,
      ),
    },
    [{ type: `trade.${status}`, city: city.id, payload: { offerId } }],
  );
}

function vote(
  state: IdleState,
  city: CityState,
  policyId: PolicyId,
  yes: boolean,
): ReduceResult {
  const meeting = state.meeting;
  if (
    !meeting ||
    !meeting.policyIds.includes(policyId) ||
    typeof yes !== "boolean"
  ) {
    return fail("BAD_REQUEST", "That policy isn't up for a vote.");
  }
  const before = meeting.votes[city.id]?.[policyId];
  return ok(
    {
      ...state,
      meeting: {
        ...meeting,
        votes: {
          ...meeting.votes,
          [city.id]: { ...meeting.votes[city.id], [policyId]: yes },
        },
      },
    },
    [
      {
        type: "meeting.voted",
        city: city.id,
        payload: { policyId, before: before ?? null, after: yes },
      },
    ],
  );
}

function teacherAction(state: IdleState, intent: Intent): ReduceResult {
  const event = (
    type: string,
    payload: Record<string, unknown> = {},
  ): GameEvent => ({ type, payload });
  const phase = (to: Phase): IdleState => ({ ...state, phase: to });

  switch (intent.type) {
    case "start":
      if (state.phase !== "lobby")
        return fail("WRONG_PHASE", "The game already started.");
      return ok(phase("running"), [
        event("game.started", { cities: state.cityIds }),
      ]);
    case "pause":
      if (state.phase !== "running")
        return fail("WRONG_PHASE", "The game isn't running.");
      return ok(phase("paused"), [
        event("phase.advanced", { from: "running", to: "paused" }),
      ]);
    case "resume":
      if (state.phase !== "paused")
        return fail("WRONG_PHASE", "The game isn't paused.");
      return ok(phase("running"), [
        event("phase.advanced", { from: "paused", to: "running" }),
      ]);
    case "setSpeed": {
      const speed = intent.payload?.speed;
      if (!SPEEDS.includes(speed))
        return fail("BAD_REQUEST", "Speed is 1, 2 or 4.");
      return ok({ ...state, speed }, [
        event("game.speed_changed", { before: state.speed, after: speed }),
      ]);
    }
    case "startMeeting":
      return startMeeting(state, intent.payload?.policyIds);
    case "closeMeeting":
      return closeMeeting(state);
    case "triggerEvent":
      return triggerEvent(state, intent.payload?.kind);
    case "end":
      if (state.phase === "ended")
        return fail("WRONG_PHASE", "The game already ended.");
      return ok(phase("ended"), [event("game.ended", { reason: "teacher" })]);
    default:
      return fail("NOT_ALLOWED", `Teachers can't ${intent.type}.`);
  }
}

function startMeeting(
  state: IdleState,
  policyIds: PolicyId[] | undefined,
): ReduceResult {
  if (state.phase !== "running" && state.phase !== "paused") {
    return fail("WRONG_PHASE", "Start the game before calling a meeting.");
  }
  const ids = [...new Set(policyIds ?? [])];
  if (
    ids.length < 1 ||
    ids.length > 3 ||
    ids.some((id) => !(id in POLICIES) || state.policies.includes(id))
  ) {
    return fail("BAD_REQUEST", "Pick 1 to 3 policies that haven't passed yet.");
  }
  return ok(
    { ...state, phase: "meeting", meeting: { policyIds: ids, votes: {} } },
    [
      {
        type: "meeting.started",
        payload: { season: state.season, policyIds: ids },
      },
    ],
  );
}

function closeMeeting(state: IdleState): ReduceResult {
  const meeting = state.meeting;
  if (state.phase !== "meeting" || !meeting)
    return fail("WRONG_PHASE", "There's no meeting to close.");

  const result: MeetingResult = {
    season: state.season,
    passed: [],
    failed: [],
    tally: {},
  };
  for (const policyId of meeting.policyIds) {
    const votes = Object.values(meeting.votes).map((v) => v?.[policyId]);
    const yes = votes.filter((v) => v === true).length;
    const no = votes.filter((v) => v === false).length;
    result.tally[policyId] = { yes, no };
    (yes > no ? result.passed : result.failed).push(policyId);
  }

  const health = healthSnapshot(state);
  const commons = Object.fromEntries(
    (Object.keys(health) as CommonsId[]).map((id) => [
      id,
      { before: state.seasonStartHealth[id], after: health[id] },
    ]),
  ) as Record<CommonsId, { before: number; after: number }>;

  const cities: IdleState["cities"] = {};
  for (const id of state.cityIds) {
    let city = state.cities[id] as CityState;
    if (result.passed.includes("park-fund")) {
      city = applyBundle(
        city,
        { coins: Math.min(20, Math.floor(city.coins)) },
        -1,
      );
    }
    const after = snapshot(city);
    cities[id] = {
      ...city,
      lastReport: {
        season: state.season,
        before: city.seasonStart,
        after,
        commons,
      },
      seasonStart: after,
    };
  }

  return ok(
    {
      ...state,
      phase: "paused",
      meeting: null,
      season: state.season + 1,
      cities,
      seasonStartHealth: health,
      policies: [...state.policies, ...result.passed],
      meetingResults: [...state.meetingResults, result],
    },
    [
      { type: "meeting.closed", payload: { ...result } },
      ...result.passed.map((policyId) => ({
        type: "policy.passed",
        payload: { policyId },
      })),
      { type: "season.ended", payload: { season: state.season } },
    ],
  );
}

function triggerEvent(
  state: IdleState,
  kind: EventKind | undefined,
): ReduceResult {
  if (!kind || !(kind in EVENTS)) return fail("BAD_REQUEST", "Pick an event.");
  if (state.phase !== "running" && state.phase !== "paused") {
    return fail("WRONG_PHASE", "Events happen while the game is on.");
  }
  if (kind === "flood") {
    const riverside = citiesBordering("river");
    const cities = { ...state.cities };
    for (const id of riverside) {
      const city = cities[id];
      if (city)
        cities[id] = applyBundle(
          city,
          { food: Math.min(10, Math.floor(city.goods.food)) },
          -1,
        );
    }
    return ok(
      {
        ...state,
        cities,
        commons: {
          ...state.commons,
          river: { ...state.commons.river, pollution: 0 },
        },
      },
      [{ type: "event.triggered", payload: { kind, cities: riverside } }],
    );
  }
  return ok(
    {
      ...state,
      events: [
        ...state.events.filter((e) => e.kind !== kind),
        { kind, untilTick: state.tick + EVENTS[kind].ticks },
      ],
    },
    [{ type: "event.triggered", payload: { kind } }],
  );
}
