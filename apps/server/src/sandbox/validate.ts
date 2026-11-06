// Checks every message a client sends before it reaches the rules engine or
// the log (ARCH-081). Anything that doesn't parse is rejected as BAD_REQUEST
// and never stored as sent.

import { z } from "zod";
import {
  BUILDABLE,
  CITY_IDS,
  EVENTS,
  GOODS,
  POLICIES,
  REFLECTION_MAX_LENGTH,
  SPEEDS,
  type ActionMessage,
  type AdminMessage,
  type EventKind,
  type PolicyId,
} from "@cs/idle";

const id = z.string().min(1).max(64);
const count = z.number().int().nonnegative().max(1_000_000);
const good = z.enum(GOODS);
const cityId = z.enum(CITY_IDS);
const policyId = z.enum(Object.keys(POLICIES) as PolicyId[]);

const bundle = z.strictObject({
  coins: count.optional(),
  food: count.optional(),
  wood: count.optional(),
  clay: count.optional(),
  copper: count.optional(),
});

const intent = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.strictObject({ type: z.literal(type), payload });
const bare = <T extends string>(type: T) =>
  z.strictObject({ type: z.literal(type), payload: z.undefined().optional() });

const building = z.strictObject({ buildingId: id });
const order = z.strictObject({ good, amount: count });
const offer = z.strictObject({ offerId: id });

const clientIntent = z.discriminatedUnion("type", [
  intent(
    "build",
    z.strictObject({ kind: z.enum(BUILDABLE), x: z.int(), y: z.int() }),
  ),
  intent("upgrade", building),
  intent("demolish", building),
  intent("toggle", building),
  intent("marketBuy", order),
  intent("marketSell", order),
  intent(
    "proposeTrade",
    z.strictObject({ to: cityId, give: bundle, get: bundle }),
  ),
  intent("acceptTrade", offer),
  intent("declineTrade", offer),
  intent("cancelTrade", offer),
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
  intent(
    "setSpeed",
    z.strictObject({ speed: z.union(SPEEDS.map((s) => z.literal(s))) }),
  ),
  intent(
    "startMeeting",
    z.strictObject({ policyIds: z.array(policyId).min(1).max(3) }),
  ),
  intent(
    "triggerEvent",
    z.strictObject({ kind: z.enum(Object.keys(EVENTS) as EventKind[]) }),
  ),
]);

const actionMessage = z.strictObject({
  clientActionId: id,
  intent: clientIntent,
});

const adminMessage = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("movePlayer"), playerId: id, cityId }),
  z.strictObject({ type: z.literal("removePlayer"), playerId: id }),
]);

export function parseAction(value: unknown): ActionMessage | null {
  const parsed = actionMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseAdmin(value: unknown): AdminMessage | null {
  const parsed = adminMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}
