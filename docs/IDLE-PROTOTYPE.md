# Idle-builder prototype

Status: **proposal**. A full, playable version of City Settlers as an idle
city builder with a shared commons, built to try the idea in a real class and
to give the team something concrete to react to. It lives beside the planned
architecture without replacing anyone's pieces (see
[Adopting it](#adopting-it)).

## Why

LC2's loop teaches a good lesson (cities share a river and woods, and
overusing them hurts everyone), but playtests and its own notes showed:

- Resources were both money and materials, and bids were paid in a specific
  resource, so students couldn't price anything.
- Clay and copper had no use except feeding other buildings.
- Happiness and population came from hidden formulas.
- Most of a turn-based round was waiting for others to press Ready.

This prototype keeps the commons lesson and changes the rest:

- **One money.** Coins come from taxes, which happy residents pay.
- **Goods with jobs.** Food grows the population. Wood and clay build and
  upgrade. Copper unlocks level 2 and 3.
- **Idle production.** Buildings produce every tick (2 s at ×1) while students
  build, upgrade and trade, so nobody waits for a turn.
- **Visible happiness.** It's a list of reasons, like "+10 Plenty of food" or
  "−6 Pollution", never a formula.
- **Teacher-run seasons.** A season ends with a **Town Meeting**: each city
  votes on rules (River Protection, Clean Air Act, Forest Reserve, Shared Park
  Fund, Free Trade), and passed rules change the game for everyone.
- **Several ways to win.** Biggest, Happiest, Greenest and Best Trader, plus a
  shared Region Health bar.

## Maps

Every map is a 16×16 grid with five city slots, one river and two woods, so
the rules and balance carry over. Teachers pick one when creating a game.

- **Nashville** (the default; a draft for the #27 workshop and #38): the
  Cumberland River winds past Germantown, East Nashville and The Gulch; Percy
  Warner Woods line the west for Sylvan Park and 12 South; Shelby Bottoms sits
  by East Nashville; The Gulch has rail-yard copper and 12 South has clay.
  Germantown and The Gulch have no woods, so they must trade for wood.
  Downtown is a skyline nobody builds on, joined to East Nashville by a
  pedestrian bridge.
- **The Valley:** LC2's original map.

`map.test.ts` checks every map's design rules (land plots that don't overlap,
a river shared by 3+ cities, someone without woods, reachable deposits), and
the balance simulation runs on each map. Adding a city means adding a map
spec in `packages/idle/src/map.ts`.

## Each student's experience

- **A first-day tutorial**: six hands-on steps (their land, supplies, build a
  farm, build houses, the City tab, sharing the river). Action steps finish
  when the city really does them, the control to use pulses, and it can be
  skipped.
- **An advisor** suggests the single most useful next step ("Start with food:
  a Farm feeds your people"), with a button that does it. Problems come first
  (hunger, full homes, no workers, pollution, a used-up river); ideas can be
  dismissed.
- **A town garden.** The town hall grows 0.5 food a day, so a new city feeds
  its first people while students learn, but it needs farms to grow.
- **Your team.** Who shares your city, what each person has done (built,
  upgraded, traded, used the market, voted, reflected), and a feed like "Ana
  built a Farm". Names reach only teammates and the teacher; the research log
  stays pseudonymous.
- **Trends.** Sparklines for people, happiness, pollution and region health.
- **Reflection.** Each season report asks one question (for example "Did your
  city's choices help or hurt the other cities?"). Answers go to the teacher
  console, which also shows each student's activity, and to teammates.
- **Sound and celebration.** Small synthesized sounds (no files) for builds,
  coins, trades, goals and meetings, quiet by default with a mute button;
  confetti for goals and accepted trades.

## For the teacher

- **A "How to run a game" checklist** that ticks itself off as the class plays.
- **Class data downloads** (#48): student activity and reflections (with
  names, for the teacher's own records), city trends, the event log
  (pseudonymous, for research), or everything as JSON. CSVs defuse text a
  spreadsheet would run as a formula.

## The commons, and proof the lesson works

The river (fish) and the two woods (wood, animals) regrow logistically:
fastest at half full, and slowed by pollution from the cities on their banks.
Each has a sustainable yield. Above it, the stock collapses, the buildings
that use it stop, and bordering cities lose happiness.

`packages/idle/src/simulate.test.ts` plays whole games with bot cities and
checks this in CI:

- A greedy class (docks and camps everywhere, never resting them) empties the
  river within about 75 days and starves.
- A sharing class (resting docks when fish run low, building parks) grows
  every city past 15 people and outscores the greedy class.
- Blue City has no woods, so it must buy or trade for wood. That's the
  interdependence LC2's workshop asked for.

All numbers live in `packages/idle/src/content.ts`.

## Layout

```
packages/idle/            Rules: content, economy, reduce(), tick, projections,
                          wire protocol. Pure and deterministic, no I/O.
apps/server/src/sandbox/  Games: REST create/join/export, Socket.IO play,
                          tick timer, research log, saving (store.ts).
apps/server/scripts/      bots.ts: a simulated classroom.
apps/web/src/game/        useGame (#26), session, API, game UI.
apps/web/src/pages/       Play, teacher console, projector, debug, lab.
apps/web/src/world/       The 3D world (React Three Fiber), drawn from the
                          server's projection.
e2e/                      Playwright: real browsers, real server.
```

The server is authoritative, as in `ARCHITECTURE.md`:

1. A client sends `{ clientActionId, intent }` and gets an ack. The server
   validates every message with zod before the engine sees it (ARCH-081):
   anything malformed is rejected as `BAD_REQUEST` and logged as
   `action.invalid` without what was sent. Messages over 16 KB close the
   connection. An error inside the engine fails that action with `INTERNAL`
   instead of stopping the server.
2. Every change broadcasts a full, versioned projection per audience:
   - **Player:** their own city in full, other cities' public faces only.
   - **Teacher:** everything, plus the roster.
   - **Projector:** public information only.
3. Retried actions are deduplicated. The client keeps one `clientActionId`
   per action until the server answers, so pressing "Try again" after a
   timeout can't run it twice. The server remembers recent ids across
   restarts.
4. Rejected attempts are logged with their error code, like accepted ones.

## Screens

| Route              | Who                     | What                                                                                     |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `/join`            | Students                | Code + name; `/join?code=ABCDE` pre-fills the code                                       |
| `/play/:code`      | Students (also `/city`) | 3D city, resource HUD, Build / Market / Trade / City tabs, spot picker, meeting, reports |
| `/teach`           | Teacher                 | Create a game: pick the map and 2–5 cities                                               |
| `/teach/:code`     | Teacher                 | Join code, guide, start/pause/speed, roster, meeting, events, reflections, downloads     |
| `/projector/:code` | Classroom screen        | Whole world, leaderboards, region health, meeting status and results                     |
| `/debug/:code`     | Anyone                  | Raw projection and live event log for this device                                        |
| `/dev/lab`         | Developers (dev only)   | One click: teacher, projector and 4 students side by side                                |

**Devices.** Every route is blocked on phones: a screen whose short side is
under 600 CSS px gets a friendly message. iPads, Chromebooks and computers
pass. The check uses screen size, not the user agent, because iPad Safari
reports itself as a Mac.

## Saving games

Games are saved to `sandbox_games` (one snapshot per game) and
`sandbox_events` (the append-only research log): Postgres (Neon) when
`DATABASE_URL` is set, otherwise PGlite in `SANDBOX_PGLITE_DIR`
(`./.pglite-sandbox`, relative to where the server starts). Production
needs `DATABASE_URL` or an explicit `SANDBOX_PGLITE_DIR`; without either, the
server exits with a message. Saves happen at most once a second per changed
game and on shutdown, in batches of 1,000 log rows. A failed save keeps its
rows and retries them on the next save. On startup, every game touched in the
last 12 hours comes back; a game that was running comes back paused for the
teacher to resume. Tokens are stored only as SHA-256 hashes.

The drivers match the main schema PR (#70); the tables are prefixed
`sandbox_` and created idempotently, so they don't touch that schema or its
migrations. Folding them into Drizzle later is a table move.

## Running and testing

```sh
npm run dev                  # web on :5173, server on :3000
```

Then open `/dev/lab` and click **Create test class**, or go to `/teach` and
create a game for real.

| Check                                               | What it proves                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                          | Rules and map checks, balance simulations on every map, socket tests with a teacher and 5 students on a real server (sync, privacy, trades, market, meeting, retries, reconnects, roster, tick loop, team attribution), saving and a full server restart, and exports |
| `npm run test:e2e`                                  | Real browsers against the production build: teacher creates, 2 students join, tutorial, build, sync, Town Meeting, season report, reflection, projector; phones blocked, iPads allowed                                                                                |
| `npm run bots -- --create --players 30 --minutes 2` | A full class against a running server (`--url` defaults to `http://localhost:3000`, `--map nashville`): action latency and tick timing                                                                                                                                |

One measured run on a laptop: 30 bots at ×2 speed had acks at p50 1 ms and
p95 13 ms, and ticks arrived every 1001 ms (2 s ÷ 2).

## Adopting it

Nothing here edits teammates' code. The only changes to the existing server
are mounting `/api/sandbox` in `app.ts` and attaching Socket.IO in `index.ts`.

| Piece                                 | Fits into                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@cs/idle` rules                      | #21 / #22 / #23 engine work: same `reduce()` shape (state + actor + intent → state + events or error) |
| `sandbox/room.ts`, `sandbox/index.ts` | #17 rooms and projections, #25 action pipeline (dedupe, rejected-action logging)                      |
| Player join and tokens                | #24 identity (teacher accounts are a placeholder token here)                                          |
| `sandbox/store.ts` (saving)           | #70 / #16 database: snapshots and the events table, same drivers                                      |
| Economy, policies, Nashville map      | #27 Nashville mechanics spec, #38 nashville-v1                                                        |
| Exports                               | #48 gameplay data export                                                                              |
| `useGame`, debug page                 | #26                                                                                                   |
| Bots script                           | #30 load test                                                                                         |
| Playwright tests                      | #39 smoke test                                                                                        |

## Not done yet

- **Nashville is a draft.** Neighborhoods, resources and tensions should
  come from the stakeholder workshop (#27).
- **Teacher identity is a token** saved in the browser that created the game.
  No accounts yet (#24).
- **Vercel previews** would need CORS for `/api/sandbox` and the socket. Today
  only same-origin and the Vite proxy work.
- **Real devices.** Performance is checked in desktop Chrome and headless
  Chromium only, not on a real Chromebook or iPad.
- **Balance is checked by bots, not children.** It needs a playtest.
