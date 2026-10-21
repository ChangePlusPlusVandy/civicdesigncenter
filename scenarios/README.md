# Scenarios

A scenario is the data a game is played with: resources, starting stock,
buildings, the map, nature features and cities. It is validated by
`ScenarioSchema` in `packages/shared/src/scenario.ts`. Rules live in
`packages/engine`.

- `lc2-default.json`: the previous City Settlers game ([LC2](https://github.com/Visheshk/LC2)),
  ported as the reference scenario for engine work.
- `nashville-v1.json`: the MVP scenario (not written yet; see #38).

## Format notes

- Ids are lowercase kebab-case.
- `map.tiles` is one string per row, top to bottom, one character per tile.
  `.` is empty; other characters map to a feature id through `map.legend`.
  Tile `(x, y)` is `tiles[y][x]`.
- City plots and views are rectangles. A plot may not overlap another plot or
  a feature, and the view must contain the plot.
- Building `upkeep` and `output` are per round the building runs. `output` may
  include stats (`pollution: 2`). `adjacency` describes a nearby feature:
  whether it is `required` to place the building, what the building `draws`
  from it, what it `affects` on it, and the `bonusOutput` it gives.
- Feature `regrowth` is the starting multiplier per stock between rounds.

## How lc2-default was ported

LC2's sources disagree in places. The port uses the values in the code that
ran (`imports/api/links/methods.js`), not its help text or its saved database
dump. Rule behaviour (how bonuses, pollution and happiness are computed) is
not ported here; it belongs to the engine tickets (#21, #22, #23).

| Item                 | Ported value                                                                                                            | Where LC2 disagrees                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Starting stock       | 4 lumber, clay, copper and food; population 3, happiness 5, pollution 0 (`ResetTeamResources`, runs last at game start) | `JoinGame` sets 2 of each and population 5 first              |
| Mine adjacency bonus | +2 resource, −1 pollution, drawing 2 from the deposit                                                                   | Help text and the database dump say +3 resource, +1 pollution |
| Farm                 | upkeep 2 lumber + 1 clay, 4 food, +2 food next to water, adds 2 pollution to the lake                                   | Dump: upkeep 1 lumber + 1 clay, 5 food, +3                    |
| Lumber camp          | upkeep 1 clay, 5 lumber                                                                                                 | Dump: upkeep 1 clay + 1 copper, 8 lumber                      |
| Fishing camp         | upkeep 1 copper                                                                                                         | Dump: 1 lumber + 1 copper                                     |
| Lake tiles           | as in `MakeMap` (includes (6,5) and (7,5))                                                                              | Dump has (5,5) and (6,5)                                      |
| Workers              | 1 per running building                                                                                                  | Implicit in LC2 (`roundEmployed`)                             |
| Cities               | the five with map positions: red, green, pink, blue, yellow                                                             | LC2 lists eight accounts; more than five crashed map setup    |

Renamed for clarity:

- Building ids: `claymine` → `clay-mine`, `foodfarm` → `farm`, and so on.
- City ids: `red-city` → `red`.
- Features: `woods1`/`woods2` → `west-woods`/`east-woods`, `mine1`/`mine2` → `clay-deposit`/`copper-deposit`.
- Feature kinds: LC2 used `lumber` for woods; here the kind is `woods`.

Not ported:

- LC2's hard-coded feature-to-city neighbour lists. The map's 4-neighbour
  adjacency gives the same pairs (#20).
- LC2 had no purchase price. Buildings are paid for by winning an auction
  bid in a randomly drawn resource (#22).
- Bugs: tied lots recorded an undefined currency; happiness could divide by zero.
