// What a client may ask the server to do. The server validates an intent with
// ActionIntentSchema, adds who sent it and when, and hands it to the engine.

import { z } from "zod";
import { IdSchema as Id } from "./scenario.ts";

// Players

export const GiftResourceIntent = z.strictObject({
  type: z.literal("giftResource"),
  payload: z.strictObject({
    to: Id,
    resource: Id,
    amount: z.int().positive(),
  }),
});

// Teacher: lifecycle. None of these carry data; who may send them, and in
// which phase, is decided by the engine.

const NoPayload = z.strictObject({});

export const StartGameIntent = z.strictObject({
  type: z.literal("startGame"),
  payload: NoPayload,
});

export const AdvancePhaseIntent = z.strictObject({
  type: z.literal("advancePhase"),
  payload: NoPayload,
});

export const PauseGameIntent = z.strictObject({
  type: z.literal("pauseGame"),
  payload: NoPayload,
});

export const ResumeGameIntent = z.strictObject({
  type: z.literal("resumeGame"),
  payload: NoPayload,
});

export const EndGameIntent = z.strictObject({
  type: z.literal("endGame"),
  payload: NoPayload,
});

export const ActionIntentSchema = z.discriminatedUnion("type", [
  GiftResourceIntent,
  StartGameIntent,
  AdvancePhaseIntent,
  PauseGameIntent,
  ResumeGameIntent,
  EndGameIntent,
]);
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionType = ActionIntent["type"];

// Identifies one client action so a retry can be recognized (ARCH-012).
export const ClientActionIdSchema = z.string().min(1).max(64);

// What the client emits as `action` (ARCHITECTURE §4): an intent and its
// `clientActionId` side by side.
export type ActionMessage = ActionIntent & { clientActionId: string };

// Splits and validates an `action` message (ARCH-081). Returns null when
// either part is invalid; the server then acks `INVALID`.
export function parseActionMessage(
  raw: unknown,
): { clientActionId: string; intent: ActionIntent } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { clientActionId, ...rest } = raw as Record<string, unknown>;
  const id = ClientActionIdSchema.safeParse(clientActionId);
  const intent = ActionIntentSchema.safeParse(rest);
  return id.success && intent.success
    ? { clientActionId: id.data, intent: intent.data }
    : null;
}
