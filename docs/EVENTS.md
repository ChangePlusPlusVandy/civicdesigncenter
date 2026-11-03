# Event log

| Field         | Value                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Status        | Draft (frozen with the Nashville spec, #27)                                                                      |
| Applies to    | `packages/engine` event types, `events` table, event catalog (`catalog.ts`), data export (#48)                   |
| Last reviewed | 2026-11-02                                                                                                       |
| Related       | #48, #64, #65, PR #70, PR #73, PR #74, [`ARCHITECTURE.md`](ARCHITECTURE.md) §4, [`GAME-RULES.md`](GAME-RULES.md) |

## 1. Scope

This document is the event contract shared by the engine, the server and the
data export: what is logged, the envelope every row carries, the canonical
enumerations and the payload of each event type. The engine emits payloads
exactly as specified in §5; the server wraps them in the envelope (§3) and
validates them against the catalog before writing. The log is research data
and the input to replay (RULE-004) and export (#48).

## 2. Logging rules

- EVT-001: Every state-changing game action MUST produce at least one event:
  bids, ready-up, placement, removal, toggles, gifts, phase changes, pause and
  resume, round resolution, game start and end, and teacher moderation.
- EVT-002: Pure UI interactions MUST NOT be logged: opening panels, hovering,
  scrolling, marking a gift notification as read.
- EVT-003: Rejected attempts MUST be logged with `outcome: rejected` and an
  `error_code`, in their own transaction, with no state change (ARCH-014).
- EVT-004: Every change MUST record the value before and after, or the delta
  when the full value is large.
- EVT-005: Events caused by a player action MUST carry `team_id` and the
  acting player's `participant_id`.
- EVT-006: System events MUST carry their inputs and the reason for their
  outcome, such as a building skipped for lack of workers.
- EVT-007: A full `round.snapshot` MUST be written at the end of every round.
- EVT-008: Events MUST NOT contain personal information. Players appear only
  as pseudonymous `participant_id`s; usernames are never logged.
- EVT-009: Coverage MUST be at least equivalent to LC2's logger (its live
  `acts` collection), verified by the logging parity test (#65).
- EVT-010: Each payload type has one zod schema in the event catalog. A
  change to a payload shape MUST increment `schema_version`.
- EVT-011: Payload fields that name a team (`team`, `fromTeam`, `toTeam`,
  `tiedTeams`) hold the team's **scenario city id** (string, for example
  `red`). The envelope identifies the team by its integer row id.
  The server maps between them through `teams.city_key`.
- EVT-012: Lifecycle payloads carry `at`, the action time the engine received
  (epoch milliseconds), so replay never infers time.

## 3. Envelope

| Column             | Type              | Rule                                                                    |
| ------------------ | ----------------- | ----------------------------------------------------------------------- |
| `event_id`         | bigint            | Primary key                                                             |
| `game_id`          | integer           | Required                                                                |
| `seq`              | integer ≥ 1       | Per game, gapless; unique with `game_id`                                |
| `version`          | integer ≥ 0       | Snapshot version this event produced; unchanged for rejected events     |
| `round`            | integer ≥ 1       | Round in effect when the event was written                              |
| `phase`            | enum §4           | Phase in effect when the event was written                              |
| `server_timestamp` | timestamptz       | Write time                                                              |
| `actor_type`       | enum §4           | Required                                                                |
| `participant_id`   | uuid, nullable    | Set only when `actor_type = player`                                     |
| `teacher_id`       | text, nullable    | Better Auth user id; set only when `actor_type = teacher`               |
| `team_id`          | integer, nullable | Acting team, or the team a system event concerns                        |
| `type`             | text              | Dotted name from §5                                                     |
| `outcome`          | enum §4           | Required                                                                |
| `error_code`       | text, nullable    | `RuleError` code or `INVALID` / `FORBIDDEN`; set only when rejected     |
| `client_action_id` | text, nullable    | From the client intent; not unique (one action can emit several events) |
| `payload`          | jsonb             | Schema per `type` (§5)                                                  |
| `schema_version`   | integer ≥ 1       | Payload schema version                                                  |

## 4. Enumerations

| Field                         | Values                                          | Notes                                                                                                                                  |
| ----------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_type`                  | `player`, `teacher`, `system`                   | `player` and `teacher` match the engine's `actor.kind`. `system` marks events the engine derives during resolution (§5, Actor column). |
| `outcome`                     | `applied`, `rejected`                           |                                                                                                                                        |
| `phase`                       | `lobby`, `auction`, `build`, `resolve`, `ended` | Matches GAME-RULES §3. Pause is the `paused` flag, not a phase.                                                                        |
| `game.ended` `reason`         | `teacher`, `resources_exhausted`                | GAME-RULES §11                                                                                                                         |
| `auction.lot_unsold` `reason` | `tie`, `no_bids`                                | GAME-RULES RULE-055                                                                                                                    |

## 5. Event types

City ids, building ids, resource ids and lot ids are strings from the
scenario or the game state.

| `type`                    | Actor           | Emitted when                               | Payload                                                                                                                   | LC2 key (`acts`)     | Status             |
| ------------------------- | --------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------ |
| `game.started`            | teacher         | `startGame`                                | `scenario` (scenario id string), `seed` (uint32), `at`                                                                    | (new)                | In review (PR #74) |
| `game.paused`             | teacher         | `pauseGame`                                | `at`                                                                                                                      | (new)                | In review (PR #74) |
| `game.resumed`            | teacher         | `resumeGame`                               | `at`                                                                                                                      | (new)                | In review (PR #74) |
| `game.ended`              | teacher, system | `endGame`, or RULE-090 at round end        | `reason` (§4), `at`                                                                                                       | (new)                | In review (PR #74) |
| `phase.advanced`          | teacher         | Any phase transition                       | `from`, `to` (§4 phases), `round` (round in effect after the change), `at`                                                | (new)                | In review (PR #74) |
| `round.ended`             | system          | Leaving `resolve`                          | `round`                                                                                                                   | (new)                | In review (PR #74) |
| `round.snapshot`          | system          | End of every round (snapshot row)          | Full state                                                                                                                | (end-of-round state) | Planned (#64)      |
| `round.city_stats`        | system          | Per city, during resolution                | `team`, `before`, `after` (each `{ resources, population, happiness, pollution }`), `happinessFactor`, `populationFactor` | `cityStatUpdate`     | Planned (#29)      |
| `production.building_ran` | system          | Per running building, during resolution    | `team`, `building`, `inputs`, `outputs`, `natureBefore`, `natureAfter`, `notes`, `skipReason` (optional)                  | `buildingRun`        | Planned (#23)      |
| `auction.lot_added`       | system          | Lot drawn into the auction                 | `lot`, `buildingType`, `resource`, `rng` (state after the draw)                                                           | `addBuilding`        | Planned (#22)      |
| `auction.bid_changed`     | player          | City changes a sealed bid                  | `lot`, `resource`, `before`, `after`, `delta`, `requested`                                                                | `BidAct`             | Planned (#22)      |
| `auction.ready_set`       | player          | City sets or clears ready                  | `ready`, `before`                                                                                                         | `bidCommit`          | Planned (#22)      |
| `auction.lot_won`         | system          | Lot resolves to a winner                   | `lot`, `team`, `resource`, `amount`, `resourcesBefore`, `resourcesAfter`                                                  | `BuildingAcquire`    | Planned (#22)      |
| `auction.lot_unsold`      | system          | Lot ties or has no bids                    | `lot`, `tiedTeams`, `reason` (§4)                                                                                         | (new)                | Planned (#22)      |
| `building.placed`         | player          | Building placed on a tile                  | `building`, `cell` (`{ x, y }`), `adjacency`                                                                              | `buildingPlace`      | Planned (#20)      |
| `building.removed`        | player          | Building removed                           | `building`, `cell`                                                                                                        | `removeBuilding`     | Planned (#20)      |
| `building.toggled`        | player          | Running state changed or attempted         | `building`, `before`, `after`, `applied`                                                                                  | `buildingToggle`     | Planned (#23)      |
| `trade.gift_sent`         | player          | Gift applied or attempted (running phases) | `fromTeam`, `toTeam` (city ids), `resource`, `amount`, `fromBefore`, `toBefore`                                           | `tradeResource`      | In review (PR #73) |
| `teacher.*`               | teacher         | Moderation                                 | Per action: team assignment, kick, rename, seat reset, room lock                                                          | (new)                | Planned (#36)      |

- EVT-020: `auction.bid_changed.delta` MUST equal `after − before`.
  `requested` is the bid the player asked for; on a rejected attempt
  `before = after` and `requested` holds the attempted value.
- EVT-021: For `trade.gift_sent`, the values after the gift are
  `fromBefore − amount` and `toBefore + amount` when applied, and unchanged
  when rejected. A gift has no trade id.
- EVT-022: A skipped building (`skipReason` set) has empty `inputs` and
  `outputs` and `natureAfter = natureBefore`.

## 6. LC2 parity

Field names come from a read-only export of the deployed LC2 app's `acts`
collection (names only; no values are copied into this repository).

- LC2 `key`, `time` and `gameCode` map to `type`, `server_timestamp` and
  `game_id`.
- The live LC2 key for bids is `BidAct` (`oldVal`, `newVal`, `change`); these
  map to `before`, `after`, `delta`.
- LC2 logs failed attempts only for trades (`success`) and toggles
  (`changed`). This log records rejections for every type (EVT-003).
- LC2 copies whole city and building documents into `buildingRun`,
  `buildingPlace` and `tradeResource`. This log records changed fields with
  before/after values and relies on per-round snapshots for full state.
- LC2 logs typed names (`localName`, `playerName`). This log records
  pseudonymous `participant_id`s only (EVT-008).
- LC2's `tradeResource.readBy` has no equivalent; notification read state is
  not logged (EVT-002).
