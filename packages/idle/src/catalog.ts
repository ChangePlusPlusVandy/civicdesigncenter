// The sandbox's event catalog (docs/EVENTS.md §7): one zod schema per event
// type (EVT-010), plus the schema for client intents that the server checks
// before the engine sees them (ARCH-081). Schemas check shape only, not game
// rules (EVT-027).

import { z } from "zod";
import {
  BUILDABLE,
  BUILDINGS,
  EVENTS,
  GOALS,
  GOODS,
  MAX_LEVEL,
  POLICIES,
  REFLECTION_MAX_LENGTH,
  SPEEDS,
  type BuildingKind,
  type EventKind,
  type GoalId,
  type PolicyId,
} from "./content.ts";
import { CITY_IDS, type CommonsId } from "./map.ts";

// Bumped whenever a payload's shape changes (EVT-010).
export const SCHEMA_VERSION = 1;

const id = z.string().min(1).max(64);
const count = z.int().nonnegative();
const amount = z.number().nonnegative();
const good = z.enum(GOODS);
const cityId = z.enum(CITY_IDS);
const policyId = z.enum(Object.keys(POLICIES) as PolicyId[]);
const eventKind = z.enum(Object.keys(EVENTS) as EventKind[]);
const commonsId = z.enum(["river", "westWoods", "eastWoods"] satisfies [
  CommonsId,
  ...CommonsId[],
]);
const phase = z.enum(["lobby", "running", "paused", "meeting", "ended"]);
const speed = z.union(SPEEDS.map((s) => z.literal(s)));
const level = z.int().min(1).max(MAX_LEVEL);

// Coins plus goods, for costs and trade offers. Always whole amounts.
const bundle = z.strictObject({
  coins: count.optional(),
  food: count.optional(),
  wood: count.optional(),
  clay: count.optional(),
  copper: count.optional(),
});
const goods = z.strictObject({
  food: amount,
  wood: amount,
  clay: amount,
  copper: amount,
});

const building = z.strictObject({
  id,
  kind: z.enum(Object.keys(BUILDINGS) as BuildingKind[]),
  x: z.int(),
  y: z.int(),
  level,
  running: z.boolean(),
  status: z.enum(["ok", "stopped", "no-workers", "commons-empty"]),
  lastOutput: z.partialRecord(good, z.number()),
});

const offer = z.strictObject({
  id,
  from: cityId,
  to: cityId,
  give: bundle,
  get: bundle,
  createdTick: count,
  status: z.enum(["open", "accepted", "declined", "cancelled", "expired"]),
});

// A city's coins and goods just before a trade (EVT-004).
const holdings = z.strictObject({ coins: amount, goods });

const intent = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.strictObject({ type: z.literal(type), payload });
const bare = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), payload: z.undefined().optional() });

const buildingRef = z.strictObject({ buildingId: id });
const order = z.strictObject({ good, amount: z.int().nonnegative() });
const offerRef = z.strictObject({ offerId: id });

// Every intent a student or the teacher may send, with its exact payload.
export const clientIntentSchema = z.discriminatedUnion("type", [
  intent(
    "build",
    z.strictObject({ kind: z.enum(BUILDABLE), x: z.int(), y: z.int() }),
  ),
  intent("upgrade", buildingRef),
  intent("demolish", buildingRef),
  intent("toggle", buildingRef),
  intent("marketBuy", order),
  intent("marketSell", order),
  intent(
    "proposeTrade",
    z.strictObject({ to: cityId, give: bundle, get: bundle }),
  ),
  intent("acceptTrade", offerRef),
  intent("declineTrade", offerRef),
  intent("cancelTrade", offerRef),
  intent("vote", z.strictObject({ policyId, yes: z.boolean() })),
  intent(
    "reflect",
    z.strictObject({
      season: z.int().positive(),
      text: z.string().max(REFLECTION_MAX_LENGTH),
    }),
  ),
  bare("start"),
  bare("pause"),
  bare("resume"),
  bare("closeMeeting"),
  bare("end"),
  intent("setSpeed", z.strictObject({ speed })),
  intent(
    "startMeeting",
    z.strictObject({ policyIds: z.array(policyId).min(1).max(3) }),
  ),
  intent("triggerEvent", z.strictObject({ kind: eventKind })),
]);

const market = z.strictObject({
  good,
  amount: z.int().positive(),
  price: amount,
  total: amount,
});
const offerClosed = z.strictObject({ offerId: id });
const commonsChange = z.strictObject({ commons: commonsId });
const empty = z.strictObject({});

// The payload schema for each event type the sandbox logs (EVT-010).
export const EVENT_SCHEMAS = {
  "game.started": z.strictObject({ cities: z.array(cityId).min(2) }),
  "game.speed_changed": z.strictObject({ before: speed, after: speed }),
  "game.ended": z.strictObject({ reason: z.literal("teacher") }),
  "game.restored": z.strictObject({ version: z.int().positive() }),
  "phase.advanced": z.strictObject({ from: phase, to: phase }),
  "player.joined": empty,
  "building.built": z.strictObject({ building, cost: bundle }),
  "building.upgraded": z.strictObject({
    buildingId: id,
    kind: z.enum(BUILDABLE),
    before: level,
    after: level,
    cost: bundle,
  }),
  "building.demolished": z.strictObject({ building }),
  "building.toggled": z.strictObject({
    buildingId: id,
    before: z.boolean(),
    after: z.boolean(),
  }),
  "market.bought": market,
  "market.sold": market,
  "trade.proposed": z.strictObject({ offer }),
  "trade.accepted": z.strictObject({
    offer,
    fromBefore: holdings,
    toBefore: holdings,
  }),
  "trade.declined": offerClosed,
  "trade.cancelled": offerClosed,
  "trade.expired": offerClosed,
  "meeting.started": z.strictObject({
    season: z.int().positive(),
    policyIds: z.array(policyId).min(1).max(3),
  }),
  "meeting.voted": z.strictObject({
    policyId,
    before: z.boolean().nullable(),
    after: z.boolean(),
  }),
  "meeting.closed": z.strictObject({
    season: z.int().positive(),
    passed: z.array(policyId),
    failed: z.array(policyId),
    tally: z.partialRecord(policyId, z.strictObject({ yes: count, no: count })),
  }),
  "policy.passed": z.strictObject({ policyId }),
  "season.ended": z.strictObject({ season: z.int().positive() }),
  "event.triggered": z.strictObject({
    kind: eventKind,
    cities: z.array(cityId).optional(),
  }),
  "commons.collapsed": commonsChange,
  "commons.recovered": commonsChange,
  "goal.achieved": z.strictObject({
    goal: z.enum(Object.keys(GOALS) as GoalId[]),
  }),
  "reflection.submitted": z.strictObject({
    season: z.int().positive(),
    text: z.string().min(1).max(REFLECTION_MAX_LENGTH),
  }),
  "teacher.player_moved": z.strictObject({
    playerId: id,
    before: cityId,
    after: cityId,
  }),
  "teacher.player_removed": z.strictObject({ playerId: id, city: cityId }),
  "action.invalid": empty,
} as const;

export type EventType = keyof typeof EVENT_SCHEMAS;

// A rejected attempt is logged under the intent's type with the intent that
// was refused, already validated (EVT-003).
const rejectedAttempt = z.strictObject({ intent: clientIntentSchema });

// Why an event doesn't match the catalog, or null if it does. Rejected
// attempts use the intent's type and carry `{ intent }`; everything else
// must be a known event type with a matching payload.
export function catalogProblem(
  event: { type: string; payload: unknown },
  outcome: "accepted" | "rejected",
): string | null {
  const schema =
    outcome === "rejected" && event.type !== "action.invalid"
      ? rejectedAttempt
      : Object.hasOwn(EVENT_SCHEMAS, event.type)
        ? EVENT_SCHEMAS[event.type as EventType]
        : null;
  if (!schema) return `Unknown event type ${event.type}`;
  const parsed = schema.safeParse(event.payload);
  return parsed.success
    ? null
    : `${event.type}: ${z.prettifyError(parsed.error)}`;
}
