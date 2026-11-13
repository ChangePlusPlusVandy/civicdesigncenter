# Game rules

| Field         | Value                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| Status        | Draft (frozen with the Nashville spec, #27)                                            |
| Applies to    | `packages/engine`, `packages/shared` (scenario and intent schemas), `scenarios/*.json` |
| Last reviewed | 2026-11-02                                                                             |
| Related       | #15, #20, #21, #22, #23, #27, #29, #38, PR #73, PR #74, [`EVENTS.md`](EVENTS.md)       |

## 1. Scope

This document specifies the game state machine and the rules the engine
enforces. Rule **structure** is normative. Numeric **values** are scenario
data: `scenarios/lc2-default.json` holds the LC2 baseline used for engine
work, and `scenarios/nashville-v1.json` (#38) holds the MVP values. Values
follow LC2 where LC2 defines one; otherwise the scenario sets a placeholder
that can be tuned without code changes. How each LC2 value was ported is
recorded in `scenarios/README.md`. Values written as "LC2: …" below are
examples from `lc2-default`, not engine constants.

| Area                                | Status             |
| ----------------------------------- | ------------------ |
| Engine contract, RNG, gifts         | In review (PR #73) |
| Lifecycle, permissions, end, replay | In review (PR #74) |
| Map adjacency and visibility        | Planned (#20)      |
| Auction                             | Planned (#22)      |
| Production                          | Planned (#23)      |
| City stats and nature               | Planned (#29)      |

## 2. Engine contract

- RULE-001: The engine exposes
  `reduce(scenario, state, action) → { ok: true, state, events } | { ok: false, error: RuleError }`.
- RULE-002: The engine is deterministic. The RNG (mulberry32, one `uint32` of
  state) lives in game state. Time enters only through `action.at`. The
  engine MUST NOT call `Math.random()`, `Date.now()` or `new Date()`, or
  perform I/O.
- RULE-003: `reduce` authorizes the action, converts it to events, and folds
  them into state with `applyEvent`. `applyEvent` is the only code that
  changes state.
- RULE-004: `replay(scenario, seed, events)` MUST reproduce the live state
  exactly, including `rng`. A log recorded with another seed or scenario is
  refused.
- RULE-005: Every event that consumes the RNG MUST carry the RNG state after
  it.
- RULE-006: On rejection the engine returns a `RuleError` with a stable
  `code` and does not change state.

An action is a validated client intent plus the server-supplied `actor` and
`at` (epoch milliseconds):

| Field     | Shape                                                                           |
| --------- | ------------------------------------------------------------------------------- |
| `type`    | Intent type (§12)                                                               |
| `payload` | Intent payload, validated by its zod schema in `packages/shared`                |
| `actor`   | `{ kind: "player", participantId, cityId }` or `{ kind: "teacher", teacherId }` |
| `at`      | Integer; server time                                                            |

- RULE-007: The engine works in scenario city ids. The server maps a player's
  team to its city through `teams.city_key` before calling the engine, and
  maps city ids back to team rows when it persists events.
- RULE-008: The engine is modular. Content (resources, buildings, features,
  map, cities, starting values) and rule parameters (§13) are scenario data.
  A scenario that passes `ScenarioSchema` MUST run without engine changes.

`RuleError` codes:

| Code                   | Meaning                                          |
| ---------------------- | ------------------------------------------------ |
| `UNKNOWN_ACTION`       | Action type has no rule                          |
| `WRONG_SCENARIO`       | State or log belongs to another scenario or seed |
| `FORBIDDEN`            | Actor kind may not take this action              |
| `INVALID_TARGET`       | Target is not valid, such as a gift to yourself  |
| `WRONG_PHASE`          | Action not allowed in the current phase          |
| `GAME_PAUSED`          | Action not allowed while paused                  |
| `NOT_PAUSED`           | Action requires a paused game                    |
| `GAME_ENDED`           | The game has ended; every action is rejected     |
| `UNKNOWN_CITY`         | City id not in the scenario                      |
| `UNKNOWN_RESOURCE`     | Resource id not in the scenario                  |
| `INVALID_AMOUNT`       | Amount out of range                              |
| `NOT_ENOUGH_RESOURCES` | The city lacks the stock                         |

Codes for the auction, build and production rules are added with #20, #22 and
#23.

## 3. Lifecycle and phases

| Field    | Values                                          |
| -------- | ----------------------------------------------- |
| `phase`  | `lobby`, `auction`, `build`, `resolve`, `ended` |
| `paused` | boolean; the phase is kept while paused         |
| `round`  | integer ≥ 1 (`start.round` in the scenario)     |

The running phases are `auction`, `build` and `resolve`.

| From               | Trigger                                   | To                           | Events                                              |
| ------------------ | ----------------------------------------- | ---------------------------- | --------------------------------------------------- |
| `lobby`            | Teacher `startGame`                       | `auction`, round 1           | `game.started`, `phase.advanced`                    |
| `auction`          | Teacher `advancePhase`                    | `build`                      | `phase.advanced`                                    |
| `build`            | Teacher `advancePhase`                    | `resolve`                    | `phase.advanced`                                    |
| `resolve`          | Teacher `advancePhase`                    | `auction`, round + 1         | `round.ended`, `phase.advanced`                     |
| `resolve`          | Teacher `advancePhase` and RULE-090 holds | `ended`                      | `round.ended`, `game.ended` (`resources_exhausted`) |
| Running            | Teacher `pauseGame` / `resumeGame`        | Same phase, `paused` toggled | `game.paused` / `game.resumed`                      |
| `lobby` or running | Teacher `endGame` (paused or not)         | `ended`                      | `game.ended` (`teacher`)                            |

- RULE-010: Only the teacher advances phases. No phase advances on a timer.
- RULE-011: Resolution (§9) runs when the teacher advances out of `build`.
- RULE-012: The engine records when the current phase began
  (`phaseStartedAt`, from `at`).

## 4. Cities and players

- RULE-020: A team plays one scenario city. A game has at most as many teams
  as the scenario has cities (LC2: `red`, `green`, `pink`, `blue`, `yellow`).
- RULE-021: The teacher assigns players to teams in the lobby.
- RULE-022: Every player may take every player action for their team. No
  player action requires approval from teammates.

## 5. Map

- RULE-030: The map is a square grid (LC2: 16×16) with 4-neighbour
  adjacency. Tile `(x, y)` is `map.tiles[y][x]`; characters map to features
  through `map.legend`.
- RULE-031: Each city owns one rectangular plot (LC2: 4×4). A city may place
  buildings only on empty tiles of its own plot. Plots do not overlap each
  other or a feature.
- RULE-032: Each city has a rectangular view that contains its plot. A
  city's projection includes only the tiles in its view (#20). The projector
  and the teacher see the whole map.
- RULE-033: Features have a `kind` (`woods`, `water`, `clay-deposit`,
  `copper-deposit`), finite `stocks` shared by all cities, and a per-stock
  `regrowth` multiplier applied between rounds.

| Feature (LC2)                    | Kind    | Stocks                 | Regrowth per round        |
| -------------------------------- | ------- | ---------------------- | ------------------------- |
| `west-woods`, `east-woods`       | `woods` | lumber 100, animals 30 | lumber ×1.1, animals ×1.1 |
| `lake`                           | `water` | fish 50, pollution 0   | fish ×1.2, pollution ×0.8 |
| `clay-deposit`, `copper-deposit` | deposit | clay 30 / copper 30    | none                      |

## 6. Resources and stats

- RULE-040: City resources (LC2): `lumber`, `clay`, `copper`, `food`. Nature
  resources: `fish`, `animals`. All amounts are integers ≥ 0.
- RULE-041: City stats: `population` (integer ≥ 0), `happiness` (number),
  `pollution` (integer ≥ 0).
- RULE-042: `wealth = clay + lumber + copper`.
- RULE-043: Starting values come from `scenario.start` (LC2: 4 of each
  resource, population 3, happiness 5, pollution 0).

## 7. Auction phase

Status: Planned (#22).

- RULE-050: When the auction phase opens, the engine draws lots at random
  from the scenario's buildings with the seeded RNG, as in LC2. Each lot is
  one building priced in one randomly drawn resource (`auction.lot_added`).
  The number of lots per auction is drawn from the scenario's
  `auction.lots` range (§13).
- RULE-051: A city places at most one sealed bid per lot: an integer ≥ 0 in
  the lot's resource, not exceeding its current stock of that resource
  (`auction.bid_changed`).
- RULE-052: A city sets or clears `ready` (`auction.ready_set`). The ready
  count is public; bid amounts are not.
- RULE-053: Sealed bids are visible only to the bidding city and the teacher
  until the lot resolves.
- RULE-054: Bids resolve when the teacher advances out of `auction`, lot by
  lot in draw order. The highest bid the city can still afford wins; the
  winner pays the bid and the building enters its storage
  (`auction.lot_won`). Stock is re-checked per lot, so earlier wins reduce
  what a city can pay later.
- RULE-055: If two or more cities tie for the highest affordable bid, nobody
  wins, each tied city pays the scenario's `auction.tieCost` in the lot's
  resource (LC2: 1), and the lot stays in the auction (`auction.lot_unsold`,
  `reason: tie`). A lot with no bids is unsold with `reason: no_bids`.

## 8. Build phase

Status: Planned (#20, #23).

- RULE-060: A city places a building from storage on an empty tile of its plot
  (`building.placed`). A building whose `adjacency.required` is true MUST be
  4-adjacent to a feature of its `featureKind`.
- RULE-061: A city may remove a placed building (`building.removed`).
- RULE-062: A city toggles a placed building between running and stopped
  (`building.toggled`).
- RULE-063: The sum of `workers` over running buildings MUST NOT exceed the
  city's population. A toggle that would exceed it is rejected.

## 9. Resolve phase

Status: Planned (#23, #29).

Resolution runs once per round, in this order:

1. Production (RULE-070).
2. City stats (RULE-080 to RULE-086).
3. Feature regrowth (RULE-033).
4. Per-round snapshot (`round.snapshot`).

### 9.1 Production

- RULE-070: Each running building pays its `upkeep` and adds its `output`. If
  it is adjacent to a feature of its `adjacency.featureKind`, it also takes
  `draws` from that feature's stocks, adds `affects` to them, and adds
  `bonusOutput`. A building that cannot pay its upkeep, or whose required
  draw exceeds the feature's stock, is skipped. Every running building emits
  `production.building_ran` with inputs, outputs and either the result or a
  `skipReason`.

| Building (LC2) | Upkeep           | Output                 | Adjacent feature | Required | Draws     | Affects      | Bonus output            |
| -------------- | ---------------- | ---------------------- | ---------------- | :------: | --------- | ------------ | ----------------------- |
| `clay-mine`    | 2 lumber, 2 food | 5 clay, +2 pollution   | `clay-deposit`   |    no    | 2 clay    | —            | +2 clay, −1 pollution   |
| `copper-mine`  | 2 lumber, 2 food | 5 copper, +2 pollution | `copper-deposit` |    no    | 2 copper  | —            | +2 copper, −1 pollution |
| `farm`         | 2 lumber, 1 clay | 4 food                 | `water`          |    no    | —         | +2 pollution | +2 food                 |
| `fishing-camp` | 1 copper         | 5 food                 | `water`          |   yes    | 2 fish    | —            | —                       |
| `hunting-camp` | —                | 3 food                 | `woods`          |   yes    | 2 animals | —            | —                       |
| `lumber-camp`  | 1 clay           | 5 lumber               | `woods`          |   yes    | 3 lumber  | —            | —                       |

Every LC2 building needs 1 worker.

### 9.2 City stats

Applied per city after production (LC2 formulas):

- RULE-080: Food upkeep: the city consumes `floor(population / 2)` food.
- RULE-081: Happiness: let
  `h = (food / population + wealth) / (pollution × population)`. If `h > 1`,
  happiness +1; if `h < 0.5`, happiness −1. When the denominator is 0, `h` is
  treated as greater than 1.
- RULE-082: Population: let `p = happiness / population`. If `p > 1.5`,
  population +1; if `p < 1`, population −1. Population does not go below 0.
- RULE-083: City pollution falls by 1 if it did not change during the round.
- RULE-084: A city with population above a scenario threshold (LC2: 7) gains
  extra pollution each round; the amount is scenario data.
- RULE-085: City pollution spreads to adjacent water features, and water
  pollution spreads back to adjacent cities above a scenario threshold (LC2:
  6); the amounts are scenario data.
- RULE-086: Each city emits `round.city_stats` with `before`, `after` and the
  factors applied.

## 10. Gifts

Status: In review (PR #73, PR #74).

- RULE-100: A player may gift resources from their city to another city at
  any time while the game is running, in every running phase. Gifts are
  rejected in `lobby`, while paused, and after the game ends. Gifts are the
  only form of trade.
- RULE-101: Intent `giftResource { to, resource, amount }`: `to` is a scenario
  city id other than the sender's, `resource` is a city resource id, and
  `amount` is an integer ≥ 1 not exceeding the sender's stock.
- RULE-102: A gift applies immediately and needs no approval. It is one-way;
  there is no offer/accept flow and no trade id.
- RULE-103: The recipient city is notified in the UI. Whether the notification
  has been read is client-only state.

## 11. End conditions

- RULE-090: When a round ends, the game ends with reason
  `resources_exhausted` if every harvestable stock on the map is 0
  (pollution is not a resource). A scenario with no harvestable stocks never
  ends this way.
- RULE-091: The teacher may end the game at any time before it has ended
  (reason `teacher`).

## 12. Action permissions

| Intent                | Actor   | Phases           | While paused |
| --------------------- | ------- | ---------------- | ------------ |
| `startGame`           | teacher | `lobby`          | —            |
| `advancePhase`        | teacher | running          | rejected     |
| `pauseGame`           | teacher | running          | rejected     |
| `resumeGame`          | teacher | running          | required     |
| `endGame`             | teacher | `lobby`, running | allowed      |
| `giftResource`        | player  | running          | rejected     |
| Bid, ready            | player  | `auction`        | rejected     |
| Place, remove, toggle | player  | `build`          | rejected     |

- RULE-110: Permissions are checked in this order: unknown action, game
  ended, actor kind, paused, phase. The first failing check sets the error
  code.
- RULE-111: The permissions table is typed over every intent type, so an
  intent without a rule does not compile.

## 13. Scenario rule parameters

Status: Planned (#22, #27, #29).

- RULE-120: Rule parameters live in the scenario, next to its content, so a
  settings interface can edit them as data. The engine MUST read them from
  the scenario and MUST NOT hard-code them.

| Parameter                     | Used by             | LC2 baseline        |
| ----------------------------- | ------------------- | ------------------- |
| `auction.lots` (`min`, `max`) | RULE-050            | Random range        |
| `auction.tieCost`             | RULE-055            | 1                   |
| `stats.*` thresholds, factors | RULE-080 – RULE-085 | LC2 formulas (§9.2) |
| `features[].regrowth`         | RULE-033            | Per feature (§5)    |
| `start`                       | RULE-043            | §6                  |
