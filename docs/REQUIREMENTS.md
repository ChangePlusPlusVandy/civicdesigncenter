# Product requirements

| Field         | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Status        | Active                                                                                |
| Applies to    | The whole product                                                                     |
| Last reviewed | 2026-11-01                                                                            |
| Related       | [`GAME-RULES.md`](GAME-RULES.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), #27, #43, #50 |

## 1. Scope

City Settlers is a browser-based, real-time, multiplayer city-planning
simulation for classrooms. Small teams each manage a city on a shared map,
acquire buildings through sealed-bid auctions, run them for resources, gift
resources to other teams, and balance resources against population,
pollution and happiness. The first scenario is set in Nashville. It is adapted
from LC2 / City Settlers.

This document defines users, interfaces, functional scope and non-functional
requirements. Game mechanics are in [`GAME-RULES.md`](GAME-RULES.md).

Out of scope:

- Native mobile apps; the product runs in a browser only.
- 3D graphics; the product is a dashboard and map UI.
- A win state.
- Hex grids.
- Research operations: IRB, consent and study design.

## 2. Users

| User       | Context                                                               | Account                           |
| ---------- | --------------------------------------------------------------------- | --------------------------------- |
| Player     | High-school or middle-school student, 2–5 per team, up to 30 per game | None; room code + username + PIN  |
| Teacher    | Runs and moderates the game from a laptop                             | Invite-only account               |
| Audience   | The whole classroom, watching the projector                           | None; read-only display           |
| Researcher | Analyzes exported event logs after a session                          | None in the app; receives exports |

## 3. Interfaces

| ID      | Interface           | Route                      | Audience projection | Status                         |
| ------- | ------------------- | -------------------------- | ------------------- | ------------------------------ |
| REQ-001 | Home                | `/`                        | —                   | Implemented                    |
| REQ-002 | Join                | `/join`                    | —                   | Implemented (mock submit, #24) |
| REQ-003 | City view           | `/city/:code`              | `team`              | Planned (#32, #33, #35)        |
| REQ-004 | Student view        | `/play/:code`              | `player`            | Deferred (#43, #34, #67)       |
| REQ-005 | Projector view      | `/projector/:code`         | `projector`         | Planned (#37)                  |
| REQ-006 | Facilitator console | `/teach`, `/teach/:gameId` | `teacher`           | Planned (#36)                  |

### 3.1 Join (REQ-002)

- REQ-010: The form MUST accept a room code of 4–8 characters `[A-Z0-9]`,
  normalized to upper case by `normalizeRoomCode` in `@cs/shared`.
- REQ-011: The form MUST accept a username of 2–24 characters, unique within
  the game and passing a profanity filter (server-side, #24).
- REQ-012: On success the client MUST store the player token in
  `localStorage` and open the city view. Until the student view (REQ-004) is
  designed, `/play/:code` and `/city/:code` render the same city view.
- REQ-013: On first join the server MUST issue the player a random PIN
  (ARCH-030). A player MUST be able to re-join the same game with the same
  username and PIN.

### 3.2 City view (REQ-003)

The shared team view. Join lands every player here. It MUST provide:

- REQ-020: The team's map plot, with placed buildings and their running state.
- REQ-021: Building storage: won buildings not yet placed.
- REQ-022: The auction: open lots, the team's sealed bids, ready-up.
- REQ-023: A city status panel: resources, population, pollution, happiness.
- REQ-024: A phase bar: round, phase, paused state.
- REQ-025: Gifting resources to another team, in every running phase (auction, build, resolve),
  with a notification when the team receives a gift.
- REQ-026: Gift history for the team.

### 3.3 Projector view (REQ-005)

- REQ-030: MUST show the whole world map with every city.
- REQ-031: MUST show the room code, round, phase and each city's public stats.
- REQ-032: MUST NOT show sealed bid amounts or any team-private data.
- REQ-033: MUST NOT accept input.

### 3.4 Facilitator console (REQ-006)

- REQ-040: Create a game from a scenario and obtain a room code.
- REQ-041: In the lobby: assign players to teams, rename or kick players,
  reset a seat, lock the room.
- REQ-042: Start the game, advance the phase, pause and resume, end the game.
- REQ-043: Show the full game state, including sealed bids.
- REQ-044: Open the projector view for the same game.

### 3.5 Scenarios

- REQ-050: Rules data (resources, buildings, map, cities, starting stats) MUST
  come from a scenario JSON file validated by a zod schema.
- REQ-051: Teachers SHOULD be able to upload a scenario JSON file (#49).
  A scenario editor UI is a stretch goal.

### 3.6 Data export

- REQ-060: A command-line export MUST produce, per game, the event log and the
  per-round snapshots in CSV or JSON (#48).
- REQ-061: Exports MUST identify players only by pseudonymous
  `participant_id`.

## 4. Non-functional requirements

| ID      | Category      | Requirement                                                                                                                                                                      |
| ------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-100 | Platform      | The product MUST run in the latest Chrome with no install. Other current browsers (Edge, Safari, Firefox) SHOULD work. Target devices: Chromebooks, tablets, laptops and phones. |
| REQ-101 | Layout        | Every view MUST be usable at 1366×768 (Chromebook) and at tablet size. Player views SHOULD be usable at 360 px wide.                                                             |
| REQ-102 | Performance   | Initial JavaScript SHOULD stay under 250 KB gzipped. The map MUST render with DOM or SVG, not WebGL.                                                                             |
| REQ-103 | Capacity      | One game MUST support 30 concurrent clients on one server instance (load test #30).                                                                                              |
| REQ-104 | Latency       | An accepted action SHOULD reach every audience within 500 ms on a classroom network.                                                                                             |
| REQ-105 | Resilience    | A server restart MUST NOT lose an accepted action. Clients MUST resynchronize on reconnect (ARCHITECTURE §5).                                                                    |
| REQ-106 | Accessibility | Views SHOULD meet WCAG 2.2 AA (audit #50).                                                                                                                                       |
| REQ-107 | Privacy       | The system MUST NOT store personal information about players beyond the username. Logs use pseudonymous IDs (EVENTS §2).                                                         |
| REQ-108 | Security      | The server MUST validate every action and MUST NOT send any client data it is not allowed to see (ARCHITECTURE §4, §5).                                                          |
| REQ-109 | Moderation    | Usernames MUST pass a profanity filter. Teachers MUST be able to kick, rename and lock the room.                                                                                 |
| REQ-110 | Cost          | All hosting and services MUST run on free tiers or stakeholder-provided infrastructure.                                                                                          |
