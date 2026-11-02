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
apps/server/src/sandbox/  In-memory games: REST create/join, Socket.IO play,
                          tick timer, research log.
apps/server/scripts/      bots.ts: a simulated classroom.
apps/web/src/game/        useGame (#26), session, API, game UI.
apps/web/src/pages/       Play, teacher console, projector, debug, lab.
apps/web/src/world/       The 3D world (React Three Fiber), drawn from the
                          server's projection.
e2e/                      Playwright: real browsers, real server.
```

The server is authoritative, as in `ARCHITECTURE.md`:

1. A client sends `{ clientActionId, intent }` and gets an ack.
2. Every change broadcasts a full, versioned projection per audience:
   - **Player:** their own city in full, other cities' public faces only.
   - **Teacher:** everything, plus the roster.
   - **Projector:** public information only.
3. Retried actions are deduplicated.
4. Rejected attempts are logged with their error code, like accepted ones.

## Screens

| Route              | Who                     | What                                                                                     |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------- |
| `/join`            | Students                | Code + name; `/join?code=ABCDE` pre-fills the code                                       |
| `/play/:code`      | Students (also `/city`) | 3D city, resource HUD, Build / Market / Trade / City tabs, spot picker, meeting, reports |
| `/teach`           | Teacher                 | Create a game (2–5 cities)                                                               |
| `/teach/:code`     | Teacher                 | Join code, start/pause/speed, roster (move/remove), meeting, events, all cities' data    |
| `/projector/:code` | Classroom screen        | Whole world, leaderboards, region health, meeting status and results                     |
| `/debug/:code`     | Anyone                  | Raw projection and live event log for this device                                        |
| `/dev/lab`         | Developers (dev only)   | One click: teacher, projector and 4 students side by side                                |

**Devices.** Every route is blocked on phones: a screen whose short side is
under 600 CSS px gets a friendly message. iPads, Chromebooks and computers
pass. The check uses screen size, not the user agent, because iPad Safari
reports itself as a Mac.

## Running and testing

```sh
npm run dev                  # web on :5173, server on :3000
```

Then open `/dev/lab` and click **Create test class**, or go to `/teach` and
create a game for real.

| Check                                               | What it proves                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                          | Rules, balance simulation, and **14 socket tests** with a teacher and 5 students on a real server (sync, privacy, trades, market, meeting, retries, reconnects, roster, tick loop) |
| `npm run test:e2e`                                  | Real browsers against the production build: teacher creates, 2 students join, build, sync, Town Meeting, season report, projector; phones blocked, iPads allowed                   |
| `npm run bots -- --create --players 30 --minutes 2` | A full class against a running server (`--url` defaults to `http://localhost:3000`): action latency and tick timing                                                                |

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
| In-memory state and log               | #70 / #16 database: snapshots and the events table                                                    |
| Economy and policies                  | #27 Nashville mechanics spec                                                                          |
| `useGame`, debug page                 | #26                                                                                                   |
| Bots script                           | #30 load test                                                                                         |
| Playwright tests                      | #39 smoke test                                                                                        |

## Not done yet

- **No persistence.** A server restart ends every game.
- **Teacher identity is a token** saved in the browser that created the game.
  No accounts yet (#24).
- **Vercel previews** would need CORS for `/api/sandbox` and the socket. Today
  only same-origin and the Vite proxy work.
- **Real devices.** Performance is checked in desktop Chrome and headless
  Chromium only, not on a real Chromebook or iPad.
- **Balance is checked by bots, not children.** It needs a playtest.
