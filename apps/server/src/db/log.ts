import * as z from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  eventPayloads,
  eventTypes,
  Phase,
  TeamId,
  ParticipantId,
  type EventType,
  type EventPayload,
} from "./catalog";
import { actorTypeEnum, outcomeEnum } from "./drizzle-schema";

// Event log: the envelope every row shares, and parseEvent, which validates envelope + payload together.
// Server-only (node:util). Payload shapes live in catalog.ts.

// Same change tags as catalog.ts (ADDED / DECISION / OPEN).
// TODO: logEvent(db, ...) that builds the envelope from game state, assigns the next seq for the game and
//   inserts the row in the same transaction as the snapshot update.

// ADDED: the envelope. The rules put these on every row (not in each payload), mapped to LC2's per-row metadata.
// FIX: resolved the OPEN note. events now has team_id / actor_type / outcome / error_code / teacher_id columns and a
//   nullable participant_id, so every envelope field has a column. The enums come from drizzle-schema.ts.
// Not in the envelope: seq and schema_version are assigned by logEvent when the row is written.
export const actorTypes = actorTypeEnum.enumValues;
export const outcomes = outcomeEnum.enumValues;

export const EventEnvelope = z
  .object({
    type: z.enum(eventTypes), // LC2: key
    ts: z.date(), // LC2: time -> events.server_timestamp
    game_id: z.number().int(), // LC2: gameCode -> games.game_id
    round: z.number().int().nonnegative(), // events.round
    phase: Phase.nullable(), // events.phase, null outside a phase (lobby)
    team_id: TeamId.nullable(), // LC2: baseId. null for game-wide events (phase.advanced, game.*, ...)
    participant_id: ParticipantId.nullable(), // LC2: userId. The student at the device; null for system / teacher events
    teacher_id: z.string().nullable(), // game_roles.user_id (Better Auth id, which is not a uuid)
    actor_type: z.enum(actorTypes),
    outcome: z.enum(outcomes), // LC2: success / changed
    error_code: z.string().nullable(), // set only when outcome is "rejected"
    client_action_id: z.string().nullable(), // events.client_action_id
    payload: z.unknown(), // checked against eventPayloads[type] by parseEvent
  })
  .superRefine((e, ctx) => {
    // "Who": exactly the id that matches the actor
    if (e.actor_type === "participant" && e.participant_id === null)
      ctx.addIssue({
        code: "custom",
        path: ["participant_id"],
        message: "participant events need participant_id",
      });
    if (e.actor_type === "teacher" && e.teacher_id === null)
      ctx.addIssue({
        code: "custom",
        path: ["teacher_id"],
        message: "teacher events need teacher_id",
      });
    if (e.actor_type !== "participant" && e.participant_id !== null)
      ctx.addIssue({
        code: "custom",
        path: ["participant_id"],
        message: `${e.actor_type} events have no participant_id`,
      });
    if (e.actor_type !== "teacher" && e.teacher_id !== null)
      ctx.addIssue({
        code: "custom",
        path: ["teacher_id"],
        message: `${e.actor_type} events have no teacher_id`,
      });
    // "Attempts too": rejected rows carry an error_code, applied rows don't
    if ((e.outcome === "rejected") !== (e.error_code !== null))
      ctx.addIssue({
        code: "custom",
        path: ["error_code"],
        message: "error_code is required for rejected events and only for them",
      });
  });

export type LoggedEvent = Omit<z.infer<typeof EventEnvelope>, "payload"> & {
  payload: EventPayload<EventType>;
};

// ADDED: validates the envelope, then the payload for its type, then the cross-field rules that need both.
// Throws (ZodError or Error) on anything that would write a bad log row.
export function parseEvent(input: unknown): LoggedEvent {
  const event = EventEnvelope.parse(input);
  const payload = eventPayloads[event.type].parse(
    event.payload,
  ) as EventPayload<EventType>;

  // Rejected attempts: nothing in the state changes (LC2 changed: false)
  if (event.outcome === "rejected") {
    const p = payload as Record<string, unknown>;
    if ("before" in p && "after" in p && !isDeepStrictEqual(p.before, p.after))
      throw new Error(
        `${event.type}: rejected event changed state (before !== after)`,
      );
    if (event.type === "auction.ready_set" && p.ready !== p.before)
      throw new Error(
        `${event.type}: rejected event changed state (ready !== before)`,
      );
  }
  // building.toggled carries LC2's "changed" as applied; it must agree with the envelope
  if (
    event.type === "building.toggled" &&
    (payload as EventPayload<"building.toggled">).applied !==
      (event.outcome === "applied")
  )
    throw new Error(`${event.type}: payload.applied disagrees with outcome`);

  return { ...event, payload };
}
