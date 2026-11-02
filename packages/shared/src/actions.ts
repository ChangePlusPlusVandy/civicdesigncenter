// What a client may ask the server to do. The server validates an intent with
// ActionIntentSchema, adds who sent it and when, and hands it to the engine.

import { z } from "zod";

const Id = z.string().min(1);

export const GiftResourceIntent = z.strictObject({
  type: z.literal("giftResource"),
  payload: z.strictObject({
    to: Id,
    resource: Id,
    amount: z.int().positive(),
  }),
});

export const ActionIntentSchema = z.discriminatedUnion("type", [
  GiftResourceIntent,
]);
export type ActionIntent = z.infer<typeof ActionIntentSchema>;
export type ActionType = ActionIntent["type"];
