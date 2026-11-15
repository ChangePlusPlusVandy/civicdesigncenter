import * as z from "zod";
import { isDeepStrictEqual } from "node:util";
import {
  ActorType,
  eventActors,
  eventPayloads,
  eventTypes,
  Outcome,
  Phase,
  TeamId,
  ParticipantId,
  type EventType,
  type EventPayload,
} from "@cs/shared/catalog";

// Event log: the envelope every row shares, and parseEvent, which validates envelope + payload together.
// Server-only (node:util). Payload shapes live in catalog.ts.

// Same change tags as catalog.ts (ADDED / DECISION / OPEN).
// TODO: logEvent(db, ...) that builds the envelope from game state, assigns the next seq for the game and
//   inserts the row in the same transaction as the snapshot update.

// ADDED: the envelope. The rules put these on every row (not in each payload), mapped to LC2's per-row metadata.
// FIX: resolved the OPEN note. events now has team_id / actor_type / outcome / error_code / teacher_id columns and a
//   nullable participant_id, so every envelope field has a column. The enums come from the catalog, like the
//   database's (EVENTS.md section 4).
// Not in the envelope: seq, version and schema_version are assigned by logEvent when the row is written.
//
// Mapping from an engine event (EVENTS.md section 3, EVT-011, ARCH-017):
//   actor_type        the sender's actor.kind (`player` / `teacher`, same names) when eventActors[type] lists it,
//                     otherwise `system` (round.ended); game.ended follows its reason (EVT-028, EVT-029)
//   participant_id    actor.participantId on player rows; teacher_id: actor.teacherId on teacher rows
//   team_id           the acting player's team; for a system event, the team row whose city_key is payload.team
//   payload           the engine payload unchanged: city ids stay city ids (EVT-011)

export const EventEnvelope = z
  .object({
    type: z.enum(eventTypes), // LC2: key
    server_timestamp: z.date(), // LC2: time
    game_id: z.number().int(), // LC2: gameCode -> games.game_id
    round: z.number().int().positive(), // events.round, at least 1
    phase: Phase, // events.phase
    team_id: TeamId.nullable(), // LC2: baseId. null for game-wide events (phase.advanced, game.*, ...)
    participant_id: ParticipantId.nullable(), // LC2: userId. The student at the device; null for system / teacher events
    teacher_id: z.string().nullable(), // game_roles.user_id (Better Auth id, which is not a uuid)
    actor_type: ActorType,
    outcome: Outcome, // LC2: success / changed
    error_code: z.string().nullable(), // set only when outcome is "rejected"
    client_action_id: z.string().nullable(), // events.client_action_id
    payload: z.unknown(), // checked against eventPayloads[type] by parseEvent
  })
  .superRefine((e, ctx) => {
    // "Who": exactly the id that matches the actor
    if (e.actor_type === "player" && e.participant_id === null)
      ctx.addIssue({
        code: "custom",
        path: ["participant_id"],
        message: "player events need participant_id",
      });
    if (e.actor_type === "teacher" && e.teacher_id === null)
      ctx.addIssue({
        code: "custom",
        path: ["teacher_id"],
        message: "teacher events need teacher_id",
      });
    if (e.actor_type !== "player" && e.participant_id !== null)
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
    // EVT-005: events caused by a player action carry the acting team
    if (e.actor_type === "player" && e.team_id === null)
      ctx.addIssue({
        code: "custom",
        path: ["team_id"],
        message: "player events need team_id",
      });
    // EVENTS.md section 5, Actor column. Rejected attempts are exempt: a FORBIDDEN attempt comes from the wrong actor
    if (e.outcome === "applied" && !eventActors[e.type].includes(e.actor_type))
      ctx.addIssue({
        code: "custom",
        path: ["actor_type"],
        message: `${e.type} cannot have actor_type ${e.actor_type}`,
      });
    // EVT-003: rejected rows carry an error_code, applied rows don't
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

  // EVT-023: rejected attempts change nothing (LC2 changed: false)
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
  // EVT-024: building.toggled carries LC2's "changed" as applied; it must agree with the envelope
  if (
    event.type === "building.toggled" &&
    (payload as EventPayload<"building.toggled">).applied !==
      (event.outcome === "applied")
  )
    throw new Error(`${event.type}: payload.applied disagrees with outcome`);
  // EVT-029: endGame is the teacher's; RULE-090 (resources_exhausted) is the system's
  if (event.type === "game.ended" && event.outcome === "applied") {
    const { reason } = payload as EventPayload<"game.ended">;
    const expected = reason === "teacher" ? "teacher" : "system";
    if (event.actor_type !== expected)
      throw new Error(
        `${event.type}: reason ${reason} needs actor_type ${expected}`,
      );
  }

  return { ...event, payload };
}
