// Checks every message a client sends before it reaches the rules engine or
// the log (ARCH-081). Anything that doesn't parse is rejected as BAD_REQUEST
// and never stored as sent.

import { z } from "zod";
import {
  CITY_IDS,
  clientIntentSchema,
  type ActionMessage,
  type AdminMessage,
} from "@cs/idle";

const id = z.string().min(1).max(64);

const actionMessage = z.strictObject({
  clientActionId: id,
  intent: clientIntentSchema,
});

const adminMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("movePlayer"),
    playerId: id,
    cityId: z.enum(CITY_IDS),
  }),
  z.strictObject({ type: z.literal("removePlayer"), playerId: id }),
]);

// The action message if it matches a known intent and its payload exactly,
// otherwise null.
export function parseAction(value: unknown): ActionMessage | null {
  const parsed = actionMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// The teacher's roster change if it is a known type with valid fields,
// otherwise null.
export function parseAdmin(value: unknown): AdminMessage | null {
  const parsed = adminMessage.safeParse(value);
  return parsed.success ? parsed.data : null;
}
