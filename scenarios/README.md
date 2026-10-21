# Scenarios

A scenario holds the data a game is played with: resources, starting stock,
buildings, the map, nature features and cities. `ScenarioSchema` in
`packages/shared/src/scenario.ts` validates it, and the rules that act on it
live in `packages/engine`.

- `lc2-default.json` is the previous City Settlers game ([LC2](https://github.com/Visheshk/LC2)),
  ported so engine work has a real scenario to test against.
- `nashville-v1.json` will be the MVP scenario. It isn't written yet (#38).

## Format notes

- Ids are lowercase kebab-case.
- `map.tiles` has one string per row, top to bottom, and one character per
  tile. `.` is an empty tile; any other character maps to a feature id through
  `map.legend`. Tile `(x, y)` is `tiles[y][x]`.
- City plots and views are rectangles. A plot can't overlap another plot or a
  feature, and the city's view has to contain its plot.
- A building's `upkeep` and `output` apply each round it runs, and `output`
  can include stats such as `pollution: 2`. `adjacency` covers a nearby
  feature: whether the building needs one to be placed (`required`), what it
  takes from the feature (`draws`), what it adds to it (`affects`), and the
  extra output it gets (`bonusOutput`).
- A feature's `regrowth` is the multiplier each stock starts with between
  rounds.

## How lc2-default was ported

LC2's code, help text and saved database dump don't always agree. Where they
differ, the port takes the value from the code that ran
(`imports/api/links/methods.js`). Only data is ported. How bonuses, pollution
and happiness are worked out each round is left to the engine tickets (#21,
#22, #23).

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

A few names changed on the way over:

- Building ids: `claymine` → `clay-mine`, `foodfarm` → `farm`, and so on.
- City ids: `red-city` → `red`.
- Features: `woods1`/`woods2` → `west-woods`/`east-woods`, `mine1`/`mine2` → `clay-deposit`/`copper-deposit`.
- LC2 gave woods the feature kind `lumber`. Here it's `woods`.

Some things were left out on purpose. LC2 hard-coded which cities border each
feature; the map's 4-neighbour adjacency gives the same pairs, so the list
isn't needed (#20). Buildings have no purchase price because, as in LC2, a city
pays for one by winning an auction bid in a randomly drawn resource (#22). Two
LC2 bugs stayed behind: tied lots recorded an undefined currency, and the
happiness formula could divide by zero.
