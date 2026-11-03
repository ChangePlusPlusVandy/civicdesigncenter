# Architecture

| Field         | Value                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------- |
| Status        | Active                                                                                        |
| Applies to    | `apps/web`, `apps/server`, `packages/*`, `deploy/*`                                           |
| Last reviewed | 2026-11-01                                                                                    |
| Related       | #14–#19, #24–#26, #64, PR #70, [`INTERACTIONS.md`](INTERACTIONS.md), [`EVENTS.md`](EVENTS.md) |

## 1. Scope

This document specifies the system's components, the action pipeline,
real-time synchronization, identity, persistence and environments. Game rules
are in [`GAME-RULES.md`](GAME-RULES.md); the event log is in
[`EVENTS.md`](EVENTS.md); diagrams are in [`INTERACTIONS.md`](INTERACTIONS.md).

Deployment model: one or more classroom devices per team, a projector showing
the whole world, and a teacher running the game from a facilitator console.
One server instance hosts all games.

## 2. Technology stack

| Layer   | Choice                                                                              | Status                                       |
| ------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| Web     | React 19, Vite, React Router, Tailwind CSS + shadcn/ui, `socket.io-client`          | Implemented (shell)                          |
| Server  | Node 22, Express 5, Socket.IO 4, zod, pino                                          | Implemented (HTTP only)                      |
| Engine  | TypeScript package with no I/O                                                      | In review (PR #73, PR #74)                   |
| DB      | Postgres via Drizzle ORM: PGlite locally and in CI, Neon in deployed environments   | In review (PR #70)                           |
| Auth    | Teachers: Better Auth (email + password, Google). Players: game-scoped bearer token | Planned (#24)                                |
| Tests   | Vitest (unit; server integration on in-memory PGlite), Playwright smoke test        | Vitest implemented; Playwright planned (#39) |
| Hosting | DigitalOcean droplet (Docker + Cloudflare tunnel), Neon Postgres, Vercel previews   | Implemented                                  |

## 3. Repository layout

| Path               | Contents                                                                      | Status                                                           |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web/`        | React client                                                                  | Implemented                                                      |
| `apps/server/`     | Express + Socket.IO server; serves `apps/web/dist` in production              | Implemented (HTTP)                                               |
| `packages/engine/` | `reduce(scenario, state, action)`, `replay(scenario, seed, events)`           | In review (PR #73, PR #74)                                       |
| `packages/shared/` | zod schemas and types: actions, socket events, projections, scenario, `can()` | Partial                                                          |
| `scenarios/`       | Scenario JSON: `lc2-default.json` (engine work), `nashville-v1.json` (MVP)    | `lc2-default`: In review (PR #73); `nashville-v1`: Planned (#38) |
| `deploy/`          | Droplet runbook and configuration; retired Azure guide                        | Implemented                                                      |
| `docs/`            | Specifications                                                                | Implemented                                                      |

- ARCH-001: Internal packages export TypeScript source. Vite compiles them for
  the web client; tsup bundles them into the server build.
- ARCH-002: `packages/engine` MUST NOT import from `apps/*` or perform I/O.
  `packages/shared` MUST NOT import Node-only modules.

## 4. Action pipeline

The server is authoritative. Clients send intents; only the server
changes state. Status: Planned (#17, #19, #25).

```
client  emit("action", { clientActionId, type, payload }, ack)
server  auth middleware        -> session { gameId, teamId?, role } + actor { kind: player | teacher, participantId | teacherId }
        per-game mutex         -> one action at a time per game
        zod validation         -> invalid? ack({ ok: false, code: "INVALID" })
        de-duplication         -> seen clientActionId? ack(original result)
        can(role, type)        -> no? ack({ ok: false, code: "FORBIDDEN" })
        team -> city           -> actor.cityId from teams.city_key
        engine.reduce(...)     -> { ok: false, error }? ack({ ok: false, code: error.code })
        DB transaction         -> map city ids to team rows; insert events; update snapshot WHERE version = v; version = v + 1
        broadcast              -> each audience receives its full projection + version
        ack({ ok: true, version })
```

- ARCH-010: Every state change MUST go through this pipeline. No other code
  path writes game state.
- ARCH-011: The server MUST process at most one action per game at a time.
- ARCH-012: `clientActionId` MUST be de-duplicated per participant; a retried
  action returns the original result and changes nothing.
- ARCH-013: The snapshot update MUST be conditional on the expected
  `version`. A version conflict aborts the transaction.
- ARCH-014: A rejected action (`INVALID`, `FORBIDDEN` or a `RuleError`) MUST
  write exactly one event with `outcome: rejected` and its `error_code`, in
  its own transaction. State and version do not change.
- ARCH-015: The `can(role, actionType)` table lives in `packages/shared` and
  runs before the engine. Every player role is allowed every player action,
  including gifts.
- ARCH-017: The server MUST translate the team's row id to its scenario city
  id (`teams.city_key`) before calling the engine, and translate city ids
  back to `team_id` when writing events (EVT-011).
- ARCH-016: Acks carry `{ ok: true, version }` or `{ ok: false, code }`. Error
  codes are stable strings.

## 5. Real-time synchronization

- ARCH-020: Socket.IO rooms exist per game, per team, per player, and one each
  for the projector and the teacher.
- ARCH-021: After every accepted action, and on every (re)connect, each
  audience receives the complete state it is allowed to see plus `version`.
  The server never sends diffs.
- ARCH-022: Clients MUST discard any projection whose `version` is lower than
  the one they hold.
- ARCH-023: `project(state, audience)` is the only producer of client-bound
  state.

| Audience    | Receives                                                                                                         | Room       |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `team`      | Own resources, stats, plot, storage, own sealed bids, visible map window, public auction state, own gift history | per team   |
| `player`    | Student view; same data as `team`                                                                                | per player |
| `projector` | Whole map, every city's public stats, round, phase, ready count; no bid amounts                                  | per game   |
| `teacher`   | Full state, including all sealed bids                                                                            | per game   |

- ARCH-024: Sealed bids MUST appear only in the owning team's and the
  teacher's projections until the lot resolves.

## 6. Identity and access

### 6.1 Players

- ARCH-030: `POST /api/games/:code/join` with `{ username }` creates a
  player (username unique per game, profanity-filtered) and returns a
  game-scoped token and a PIN. The server generates the PIN at random and
  rejects candidates that fail a filter (offensive or trivially guessable
  values). With `{ username, pin }` it re-joins (ARCH-033). The server stores
  only hashes of the token and the PIN. Status: Planned (#24).
- ARCH-031: Token claims: `gameId`, `participantId`, `teamId`, `role`.
  `role` defaults to `seat`.
- ARCH-032: The client keeps the token in `localStorage` and sends it in the
  Socket.IO `auth` payload and the `Authorization` header.
- ARCH-033: Re-join: the same username and PIN issue a new token for the same
  `participantId`. The server overwrites `players.token_hash` with the new
  token's hash, so the previous token no longer authenticates. The PIN check
  and the overwrite MUST run as one conditional update in a single
  transaction.
- ARCH-034: There are no student accounts. `participantId` is a
  random UUID and is the only player identifier in logs.
- ARCH-035: On re-join the server MUST disconnect every socket opened with
  the previous token.

### 6.2 Teachers

- ARCH-040: Teachers sign up with an invite code and sign in with email +
  password or Google, via Better Auth. Google sign-in is enabled only on the
  staging origin; previews use email + password.
- ARCH-041: Every teacher action MUST check `game_roles` for the target game.
- ARCH-042: Teacher moderation: assign teams, kick, rename, reset a seat,
  lock the room.

## 7. Persistence

- ARCH-050: Tables: `games`, `teams`, `players` (with `role`, default
  `seat`), `game_roles`, `snapshots` (state JSON + `version`), `events`
  (append-only), plus the Better Auth tables. Status: In review (PR #70).
- ARCH-051: The database driver is chosen by `DATABASE_URL`: blank selects
  PGlite in `./.pglite/`; otherwise `pg`.
- ARCH-052: The server keeps the latest snapshot per game for rehydration and
  one snapshot per round for research and replay.
- ARCH-053: On boot the server rehydrates every game whose phase is not
  `ended` from its latest snapshot. `replay(scenario, seed, events)`
  (RULE-004) rebuilds the same state from the event log and is the fallback
  and the audit check.
- ARCH-054: The event log schema and catalog are specified in
  [`EVENTS.md`](EVENTS.md).

## 8. HTTP surface

| Method | Path                       | Purpose                                | Status        |
| ------ | -------------------------- | -------------------------------------- | ------------- |
| GET    | `/healthz`, `/api/healthz` | `{ ok: true, engineVersion }`          | Implemented   |
| POST   | `/api/games/:code/join`    | Player join and re-join                | Planned (#24) |
| *      | `/api/auth/*`              | Better Auth                            | Planned (#24) |
| GET    | any other non-API path     | SPA `index.html` fallback (production) | Implemented   |

- ARCH-060: Unknown `/api/*` paths return `404 { error: "not_found" }`.
- ARCH-061: In production the server serves `apps/web/dist` and leaves `/api`
  and `/socket.io` to their handlers.
- ARCH-062: CORS allows only the server's own origin and the origins in
  `CORS_ORIGINS` (Vercel previews).

## 9. Environments

| Env        | Web                                         | API        | DB                                         |
| ---------- | ------------------------------------------- | ---------- | ------------------------------------------ |
| Local      | Vite :5173, proxies `/api` and `/socket.io` | :3000      | PGlite in `./.pglite/`, or optional Docker |
| CI         | —                                           | tests only | In-memory PGlite                           |
| PR preview | Vercel (`VITE_API_URL` = staging)           | Droplet    | Neon                                       |
| Staging    | Served by the server (same origin)          | Droplet    | Neon                                       |
| Production | Served by the server (same origin)          | Droplet    | Neon                                       |

- ARCH-070: Local development and CI MUST NOT connect to Neon.
- ARCH-071: On push to `main`, GitHub Actions builds the server image to
  GHCR (`image.yml`) and then redeploys the droplet through the `droplet`
  environment (`deploy-droplet.yml`). Status: Implemented. See
  [`deploy/droplet/README.md`](../deploy/droplet/README.md).
- ARCH-075: On push to `main`, after CI passes, GitHub Actions MUST run
  migrations against Neon using `DATABASE_URL_DIRECT` before the deploy.
  Status: Planned (#18).
- ARCH-072: The droplet is a shared host: changes there are additive only.
- ARCH-073: No fallback host is running. `deploy/azure-appservice/README.md`
  recreates Azure App Service if needed. For a local demo:
  `npm run build && NODE_ENV=production npm start` with `DATABASE_URL` set to
  Neon.
- ARCH-074: Configuration variables are listed in `.env.example`. Real values
  live in GitHub Actions, Vercel and the server environment, never in the
  repository.

## 10. Security requirements

Derived from LC2's known defects (no server-side checks, all data published to
all clients, hard-coded credentials).

- ARCH-080: The server MUST authenticate every socket connection and HTTP
  request that touches a game.
- ARCH-081: The server MUST validate every action payload with zod before it
  reaches the engine.
- ARCH-082: The server MUST NOT send password hashes, token hashes, other
  teams' private data or sealed bids outside ARCH-024.
- ARCH-083: Credentials and secrets MUST come from the environment.
- ARCH-084: Phases and turn order MUST be enforced by the engine on the
  server, never only in the UI.
