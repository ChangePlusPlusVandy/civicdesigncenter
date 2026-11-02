// What a client may ask the server to do. The server validates an intent with
// ActionIntentSchema, adds who sent it and when, and hands it to the engine.

import { z } from "zod";

const Id = z.string().min(1);

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
