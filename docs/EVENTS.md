# Event catalog (draft)

Status: **draft**, frozen together with the Nashville spec on 11/15. The
columns every event row carries are listed in
[ARCHITECTURE.md → Data](ARCHITECTURE.md#data). This file lists the event
`type`s and the payload each one must carry.

## Rules

- **Log every state-changing game action.** Bids, ready-up, placement,
  toggles, trades, round resolution, teacher moderation. Skip pure UI
  (opening a panel, hovering, scrolling).
- **At least LC2 parity.** Everything the deployed LC2 logger records
  (its live `acts` collection, which is newer than its GitHub repo) has an
  equivalent here, including its metadata.
- **Before and after.** Every change records the value before and after (or
  the delta, when the full value is large).
- **Who.** `team_id` plus the `participant_id` of the student at the device.
  System events have `actor_type: system`.
- **Attempts too.** Rejected actions are logged with `outcome: rejected` and
  an `error_code`; nothing in the state changes (LC2: `success: false`,
  `changed: false`).
- **System events with reasons.** Production logs each building's inputs and
  outputs, or why it was skipped; city stats log the factors behind the change.
- **Snapshots per round.** A full `round.snapshot` row at the end of every
  round (not only the latest state).
- **No personal information.** Participants are pseudonymous IDs.

## Types

| LC2 key (`acts`)       | LC2 fields (live)                                                                  | `type`                          | Required payload                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `BidAct`               | `buildingId`, `bidKind`, `oldVal`, `newVal`, `change`, `baseId`, `localName`       | `auction.bid_changed`           | `lot`, `resource`, `before`, `after`                                               |
| `bidCommit`            | `commitState`, `baseId`, `localName`                                               | `auction.ready_set`             | `ready`                                                                            |
| `addBuilding` (lot)    | `buildingId`, `location`, `userId`                                                 | `auction.lot_added`             | `buildingType`, `resource`                                                         |
| `BuildingAcquire`      | `buildingId`, `baseId`, `bidKind`, `bidVal`, `oldRes.*`, `newRes.*`                | `auction.lot_won`               | `lot`, `team`, `amount`, `resourcesBefore`, `resourcesAfter`                       |
| (new)                  |                                                                                    | `auction.lot_unsold`            | `lot`, `tiedTeams`                                                                 |
| `buildingPlace`        | `building` (full doc), `newMap` (tile x/y + building), `localName`                 | `building.placed`               | `building`, `cell`, `adjacency`                                                    |
| `removeBuilding`       | `buildingId`, `localName`                                                          | `building.removed`              | `building`, `cell`                                                                 |
| `buildingToggle`       | `buildingId`, `pastStatus`, `newStatus`, `changed`, `baseId`, `localName`          | `building.toggled`              | `before`, `after`, `applied`                                                       |
| `tradeResource`        | `from` / `to` (full city docs), `resource`, `amount`, `success`, `readBy`          | `trade.gift_sent`               | `fromTeam`, `toTeam`, `resource`, `amount`, `fromBefore`, `toBefore` (+ `outcome`) |
| `buildingRun`          | `game` (full city doc, incl. `notes`, `res.*`, `pollution`), `building` (full doc) | `production.building_ran`       | `inputs`, `outputs`, `natureBefore`, `natureAfter`, `notes` / `skipReason`         |
| `cityStatUpdate`       | `newRes.*`, `newPop`, `happiness`                                                  | `round.city_stats`              | `before`, `after`, `happinessFactor`, `populationFactor`                           |
| (other collections)    | end-of-round team, owned and public factory state                                  | `round.snapshot` (snapshot row) | full state                                                                         |
| `tradeResource.readBy` | field on the trade, not its own key                                                | `trade.notification_read`       | (confirm with the stakeholder)                                                     |
| (new)                  |                                                                                    | `phase.advanced`                | `from`, `to`, `round` (the round now in effect), `at`                              |
| (new)                  |                                                                                    | `round.ended`                   | `round`                                                                            |
| (new)                  |                                                                                    | `game.started`                  | `scenario`, `seed`, `at`                                                           |
| (new)                  |                                                                                    | `game.ended`                    | `reason` (`teacher` or `resources_exhausted`), `at`                                |
| (new)                  |                                                                                    | `game.paused`                   | `at`                                                                               |
| (new)                  |                                                                                    | `game.resumed`                  | `at`                                                                               |
| (new)                  |                                                                                    | `teacher.*`                     | moderation: team assignment, kick, rename, seat reset, room lock                   |

Every LC2 row also has `key`, `time` and `gameCode`, which map to `type`,
`ts` and `game_id`. The field list comes from a read-only export of the
deployed app's `acts` collection (field names only; no values are copied into
the repo). Notes from that export:

- The live key is `BidAct` (with `oldVal` / `newVal` / `change`), not
  `bidChange`.
- LC2 records failed attempts only on trades (`success`) and toggles
  (`changed`). We log rejections for every action type.
- LC2 copies whole city and building documents into `buildingRun`,
  `buildingPlace` and `tradeResource`. We log the fields that changed with
  `before` / `after` and rely on per-round snapshots for full state.
- LC2 logs typed names (`localName`, `playerName`). We log pseudonymous
  `participant_id`s only.
