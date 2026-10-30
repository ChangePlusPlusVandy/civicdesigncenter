import * as z from "zod";
import { phaseEnum } from "./drizzle-schema";

// Event catalog: one payload schema per event type (the data contract).
// No Node-only imports here, so the web client can import it too. The envelope and parseEvent live in log.ts.
// Change tags used in this file:
//   FIX:      was wrong or contradicted the spec, now corrected
//   ADDED:    was missing, the spec requires it
//   DECISION: the spec left this unclear; resolved here, reason given
//   OPEN:     needs the lead / stakeholder; current shape is provisional

// Shared shapes
// newMap carries tile x/y, so a cell is a coordinate pair, not a single number
const Cell = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

// oldRes.* / newRes.* are whole resource maps (resource name -> amount), not single numbers
const Resources = z.record(z.string(), z.number().int());

// ADDED: named id shapes, so every event uses the same type for the same thing.
//   LC2 buildingId is the same id in the auction (as "lot") and on the map (as "building").
export const TeamId = z.number().int(); // teams.team_id (integer in drizzle-schema)
const BuildingId = z.string(); // LC2 buildingId
export const ParticipantId = z.uuid(); // players.participant_id

// FIX: removed BuildingDoc (z.record of the full building doc). The spec says LC2 copies whole documents
//   into buildingPlace / buildingRun / tradeResource, and that we log only the changed fields with before / after
//   and rely on round.snapshot for full state. So events reference buildings by id instead.

// ADDED: city stats compared by round.city_stats (LC2 cityStatUpdate: newRes.*, newPop, happiness)
const CityStats = z.object({
  resources: Resources, // related field: newRes.*
  population: z.number().int(), // related field: newPop
  happiness: z.number(), // related field: happiness (not forced to int: it can be a score/percentage)
});

// ADDED: phases come from the database enum, so the catalog and events.phase cannot drift apart
export const Phase = z.enum(phaseEnum.enumValues);

// NOTE (applies to every payload below): validation checks shape only, not game rules
//   (e.g. no positive-amount or own-team checks). Rejected attempts carry bad values and must still be loggable.

export const eventPayloads = {
  //LC2: BidAct
  "auction.bid_changed": z
    .object({
      lot: BuildingId, // related field: buildingId
      resource: z.string(), // related field: bidKind
      before: z.number().int(), // related field: oldVal
      after: z.number().int(), // related field: newVal
      delta: z.number().int(), // related field: change
      // FIX: removed the "STRAYS FROM LC2 KEY" note. "delta" is the equivalent of LC2's live "change" field,
      //   and the parity rule requires an equivalent for every live LC2 field, so it stays.
      //   The refine below keeps it consistent with before / after.
      requested: z.number().int(), // related field: (NEW)
      // DECISION: kept "requested" (the value the student asked for). On a rejected attempt before === after
      //   (nothing changes), so this is the only place the attempted bid is recorded.
      // LC2 baseId -> envelope team_id; localName -> dropped (no personal information)
    })
    .refine((p) => p.delta === p.after - p.before, {
      message: "delta must equal after - before",
      path: ["delta"],
    }),
  // ADDED: the refine above (catches delta computed the wrong way round, e.g. before - after)

  //LC2: bidCommit
  "auction.ready_set": z.object({
    ready: z.boolean(), // related field: commitState (the value after the action)
    // STRAYS FROM LC2 KEY (type only): changed from z.string() to z.boolean(), because "ready" is a yes/no flag.
    //   If commitState is actually a string enum, map it to a boolean when building the event.
    before: z.boolean(), // related field: (NEW)
    // DECISION / FIX: added "before" to satisfy the before/after rule. The required payload lists "ready", which
    //   stays (it acts as "after"); extra fields are allowed. before can't be derived from ready: setting
    //   ready=true twice is a no-op, not a change. This resolves the old "check with your lead" note.
    // LC2 baseId -> envelope team_id; localName -> dropped (no personal information)
  }),

  //LC2: addBuilding (lot)
  "auction.lot_added": z.object({
    buildingType: z.string(), // related field: (NEW) - not among the live fields, has to be looked up
    resource: z.string(), // related field: (NEW) - addBuilding has no bidKind, has to be looked up
    lot: BuildingId, // related field: buildingId
    // FIX: removed the "STRAYS" note. "lot" is the equivalent of LC2 buildingId (parity rule), and
    //   lot_won / lot_unsold need it to point back at this lot.
    location: z.unknown(), // related field: location
    // ADDED: LC2 parity, addBuilding has a live "location" field that had no equivalent here.
    // OPEN: the export has field names only, so the shape of location is unknown. Pin it down
    //   (a Cell? a market slot string?) and replace z.unknown().
    // LC2 userId -> envelope participant_id / teacher_id
  }),

  //LC2: BuildingAcquire
  "auction.lot_won": z.object({
    lot: BuildingId, // related field: buildingId
    team: TeamId, // related field: baseId -> teams.team_id (integer in drizzle-schema)
    amount: z.number().int(), // related field: bidVal
    resourcesBefore: Resources, // related field: oldRes.*  (was misspelled "resourceBefore" and typed as a single int)
    resourcesAfter: Resources, // related field: newRes.*   (was typed as a single int)
    resource: z.string(), // related field: bidKind
    // FIX: removed the "STRAYS" note. "resource" is the equivalent of LC2 bidKind, which the parity rule requires.
    // NOTE: this is a system event (round resolution), so the winner goes in "team" and the envelope's
    //   participant_id is null.
  }),

  //LC2: (NEW) -> auction.lot_unsold
  "auction.lot_unsold": z.object({
    lot: BuildingId, // related field: buildingId
    tiedTeams: z.array(TeamId), // related field: (NEW) - team_ids of the tied teams, same type as lot_won.team
    reason: z.enum(["tie", "no_bids"]), // related field: (NEW)
    // ADDED / DECISION: "system events with reasons". A lot can also go unsold because nobody bid;
    //   then tiedTeams is [], and without a reason an empty array is ambiguous.
  }),

  //LC2: buildingPlace
  "building.placed": z.object({
    building: BuildingId, // related field: building._id
    // FIX: was BuildingDoc (the full doc). The spec says to log changed fields only (see note at the top),
    //   and building.removed / toggled / ran all use the id, so "building" now means the same thing everywhere.
    cell: Cell, // related field: newMap tile x/y, was a single int
    adjacency: z.array(z.object({ building: BuildingId, cell: Cell })), // related field: (NEW) - derived server-side
    // FIX / DECISION: was z.string(). Adjacency is a set of neighbours, so it is now the list of buildings on the
    //   cells next to "cell" ([] when there are none). Analysts can compute bonuses from this without parsing a string.
    // OPEN: if the game defines adjacency as a bonus number instead, swap this for that.
    // LC2 newMap.building -> "building"; localName -> dropped (no personal information)
  }),

  //LC2: removeBuilding
  "building.removed": z.object({
    building: BuildingId, // related field: buildingId (removeBuilding sends only the id, not a full doc)
    // FIX: removed the "same key name, different shapes" note. building.placed now uses the id too.
    cell: Cell, // related field: (none live) - removeBuilding has no newMap, so look up the cell from map state
    //   (was z.number() and mapped to newMap, which this act does not send)
    // FIX: removed "lot". It held the same value as "building" (both are buildingId) and is not in the required payload.
    // LC2 localName -> dropped (no personal information)
  }),

  //LC2: buildingToggle
  // ADDED: whole event
  "building.toggled": z.object({
    building: BuildingId, // related field: buildingId
    before: z.boolean(), // related field: pastStatus (true = on)
    after: z.boolean(), // related field: newStatus
    // DECISION: "after" is the state after the action, not the state that was asked for. On a rejected toggle
    //   after === before, which keeps "nothing in the state changes" true. The requested state is always !before.
    //   If LC2 status is a string ("on"/"off"), map it to a boolean when building the event.
    applied: z.boolean(), // related field: changed
    // NOTE: duplicates envelope outcome, but the key requires it (LC2 changed). parseEvent checks they agree.
    // LC2 baseId -> envelope team_id; localName -> dropped (no personal information)
  }),

  //LC2: tradeResource
  // ADDED: whole event
  "trade.gift_sent": z.object({
    trade: z.string(), // related field: trade doc id (NEW)
    // ADDED / DECISION: not in the required payload, but trade.notification_read (LC2 readBy, a field on the trade)
    //   has to say which trade was read. Without an id, nothing links the two.
    fromTeam: TeamId, // related field: from (full city doc) -> its team id
    toTeam: TeamId, // related field: to (full city doc) -> its team id
    resource: z.string(), // related field: resource
    amount: z.number().int(), // related field: amount (this is also the delta for both sides)
    fromBefore: z.number().int(), // related field: from.res[resource]
    toBefore: z.number().int(), // related field: to.res[resource]
    // DECISION: fromBefore / toBefore are the single changed resource, not full resource maps ("log the fields
    //   that changed"). The after values are fromBefore - amount and toBefore + amount when the trade was applied,
    //   and unchanged when it was rejected.
    // LC2 success -> envelope outcome (+ error_code); readBy -> trade.notification_read
  }),

  //LC2: buildingResource
  // FIX: removed this placeholder. buildingResource is not in the spec's type table and not among the live acts,
  //   so there is nothing to map. Add it back with a type if the stakeholder says it exists.

  //LC2: buildingRun
  // ADDED: whole event (system event: one row per building, per production step)
  "production.building_ran": z
    .object({
      building: BuildingId, // related field: building._id (full doc -> id, see note at the top)
      inputs: Resources, // related field: (NEW) - resources the building consumed
      outputs: Resources, // related field: (NEW) - resources the building produced
      natureBefore: z.number(), // related field: game.pollution before the run
      natureAfter: z.number(), // related field: game.pollution after the run
      notes: z.array(z.string()), // related field: game.notes
      skipReason: z.string().optional(), // related field: (NEW)
      // DECISION: "production logs inputs and outputs, or why it was skipped". When skipReason is set the building
      //   did not run: inputs / outputs are {} and natureAfter === natureBefore (the refine below checks this).
      // LC2 game.res.* -> covered by inputs / outputs (the delta) + round.snapshot (full state)
    })
    .refine(
      (p) =>
        p.skipReason === undefined ||
        (Object.keys(p.inputs).length === 0 &&
          Object.keys(p.outputs).length === 0 &&
          p.natureAfter === p.natureBefore),
      {
        message:
          "a skipped building cannot have inputs, outputs or a nature change",
        path: ["skipReason"],
      },
    ),

  //LC2: cityStatUpdate
  // ADDED: whole event (system event, one per team per round)
  "round.city_stats": z.object({
    before: CityStats, // related field: (NEW) - LC2 only sends the new values
    after: CityStats, // related field: newRes.*, newPop, happiness
    happinessFactor: z.number(), // related field: (NEW) - "factors behind the change"
    populationFactor: z.number(), // related field: (NEW)
    // OPEN: if a factor is a breakdown (several causes) rather than one multiplier, change these to
    //   z.record(z.string(), z.number()).
  }),

  //LC2: snapshots (checkout)
  // ADDED: whole event. The snapshots table holds only the latest state (one row per game), so the
  //   per-round copy is a row in events with this type. The round number is the envelope's round.
  "round.snapshot": z.object({
    teams: z.array(z.record(z.string(), z.unknown())), // end-of-round team state
    ownedFactories: z.array(z.record(z.string(), z.unknown())), // buildings owned by teams
    publicFactories: z.array(z.record(z.string(), z.unknown())), // buildings nobody owns
    // DECISION: loose records on purpose. This is the "full state" row, so it should not drop fields the
    //   game adds later. Tighten once the state shape is fixed.
  }),

  //LC2: tradeResource.readBy -> is field not key
  // ADDED: whole event
  // OPEN: the spec says "confirm with the stakeholder". Provisional shape: which trade was read; the reader is
  //   the envelope's participant_id / team_id. before/after: unread -> read is implied by the event itself.
  "trade.notification_read": z.object({
    trade: z.string(), // related field: trade doc id (same value as trade.gift_sent.trade)
  }),

  //LC2: (NEW) -> phase.advanced
  // ADDED
  "phase.advanced": z.object({
    from: Phase.nullable(), // null when leaving the lobby (events.phase is null there too)
    to: Phase.nullable(), // null when the game leaves the last phase
  }),

  //LC2: (NEW) -> round.ended
  // ADDED
  "round.ended": z.object({
    round: z.number().int().nonnegative(),
  }),

  //LC2: (NEW) -> game.started
  // ADDED
  "game.started": z.object({
    scenario: z.number().int(), // games.scenario_id
    seed: z.number().int(), // games.rng_seed
  }),

  //LC2: (NEW) -> game.ended
  // ADDED
  "game.ended": z.object({
    reason: z.string().min(1),
    // OPEN: swap for an enum (e.g. "completed" | "teacher_ended") once the game flow defines the end conditions.
  }),

  //LC2: (NEW) -> teacher.*
  // ADDED: one event per moderation action listed in the spec. All have actor_type "teacher".
  "teacher.team_assigned": z.object({
    participant: ParticipantId,
    before: TeamId.nullable(), // players.team_id, null = no team (lobby)
    after: TeamId.nullable(),
  }),
  "teacher.player_kicked": z.object({
    participant: ParticipantId,
    team: TeamId.nullable(), // team the student was on, so analysts don't need the players table
  }),
  "teacher.player_renamed": z.object({
    participant: ParticipantId,
    // DECISION: no before / after names. Usernames are typed by students and the "no personal information" rule
    //   wins over before/after here. The event still records that and when the rename happened.
  }),
  "teacher.team_renamed": z.object({
    team: TeamId,
    // DECISION: no before / after names, same reason as teacher.player_renamed (team names are typed text).
    // OPEN: if team names are picked from a fixed list, they are safe to log as before / after.
  }),
  "teacher.seat_reset": z.object({
    participant: ParticipantId,
    // Token hashes are never logged.
  }),
  "teacher.room_locked": z.object({
    before: z.boolean(), // games.locked
    after: z.boolean(),
  }),
};
// ADDED: every type in the spec's table now has a schema above (the empty placeholders are filled in).

// ADDED: types derived from the catalog, so callers can't log a type that doesn't exist (the seed used "bid_placed")
export type EventType = keyof typeof eventPayloads;
export type EventPayload<T extends EventType> = z.infer<
  (typeof eventPayloads)[T]
>;
export const eventTypes = Object.keys(eventPayloads) as [
  EventType,
  ...EventType[],
];
