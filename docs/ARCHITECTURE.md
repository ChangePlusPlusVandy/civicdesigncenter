# Architecture

City Settlers is a real-time multiplayer city-planning game played in a
classroom. Each student has their own device, each team (city) shares a city
view, and a projector shows the whole world. A teacher runs the game from a
facilitator console.

## Tech stack

| Layer   | Choice                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| Web     | React 19, Vite, React Router, Tailwind CSS + shadcn/ui, `socket.io-client`                                      |
| Server  | Node 22, Express 5, Socket.IO 4, zod, pino                                                                      |
| Engine  | Pure TypeScript package: game rules only, no I/O                                                                |
| DB      | Postgres via Drizzle ORM: PGlite locally and in CI, Neon in the cloud                                           |
| Auth    | Teachers: Better Auth (email + password, Google). Players: a game-scoped token, no account                      |
| Tests   | Vitest (engine; server integration on in-memory PGlite), Playwright smoke test                                  |
| Hosting | Neon (Postgres), Vercel (PR previews of the web client), a DigitalOcean droplet for the server (pending access) |

## Repository layout

```
apps/web/          React client
apps/server/       Express + Socket.IO game server; serves apps/web/dist in production
packages/engine/   reduce(scenario, state, action) -> { state, events } | RuleError
packages/shared/   zod schemas and types: actions, socket events, projections, scenario
scenarios/         scenario JSON (lc2-default.json for engine work, nashville-v1.json for the MVP)
```

Internal packages export TypeScript source. Vite compiles them for the web,
and tsup bundles them into the server build.

## How a game action flows

The server is authoritative. Clients send intents; only the server changes state.

```
client  emit("action", { clientActionId, type, payload })
server  auth middleware          -> actor { player | teacher, gameId, teamId }
        per-game mutex           -> one action at a time per game
        zod validation
        engine.reduce(...)       -> RuleError? ack({ ok: false, code })
        DB transaction           -> insert events; update snapshot WHERE version = v (then v + 1)
        broadcast                -> each audience gets its full projected state
        ack({ ok: true, version })
```

- **Full-state projections, no diffs.** After every change, and on every
  (re)connect, each audience (`player`, `team`, `projector`, `teacher`)
  receives the complete state it is allowed to see, plus a `version`.
  Clients ignore older versions.
- **Hidden information stays on the server.** Sealed bids appear only in the
  owning team's projection until the auction resolves.
- **Retries are safe.** `clientActionId` is de-duplicated per participant.
- **Restarts are safe.** Active games rehydrate from their latest snapshot on
  boot. There is one server instance and no Redis.

## Engine rules

- Deterministic: the RNG seed and RNG state live in game state, and time is
  passed in with the action. The engine never calls `Math.random()` or `Date.now()`.
- Replay test: the event log plus the initial seed must reproduce the final snapshot.
- Scenarios are data (JSON validated by a zod schema): resources, buildings,
  map, cities, starting stats. Rules are written concretely for the current
  scenario.
- Deliberately not built yet: hex grids, pluggable rule modules.

## Data

- `games`, `players`, `teams`, `snapshots` (state JSON + `version`), `events`
  (append-only), plus the Better Auth tables and `game_roles`.
- Every event records `participant_id` (pseudonymous), `game_id`, `round`,
  `phase`, `type`, `payload` and a server timestamp. The event log is also
  research data, so never log personal information.
- The repo is public: no real data, secrets or student information in it. Seed data is synthetic.

## Identity

- **Players** join with a room code and a username (unique per game,
  profanity-filtered). The server returns a token that the client keeps in
  `localStorage` and sends in the Socket.IO `auth` payload and the
  `Authorization` header. Teachers can assign teams, kick, rename, reset a
  seat, and lock the room.
- **Teachers** sign up with an invite code and log in with email + password or
  Google. Google sign-in only works on the staging origin (added once the droplet is
  live); until then, and on Vercel previews, use email + password. Every teacher action checks `game_roles`.

## Environments

| Env        | Web                                         | API                 | DB                                         |
| ---------- | ------------------------------------------- | ------------------- | ------------------------------------------ |
| Local      | Vite :5173, proxies `/api` and `/socket.io` | :3000               | PGlite in `./.pglite/`, or optional Docker |
| CI         | —                                           | tests only          | in-memory PGlite                           |
| PR preview | Vercel (UI review; `VITE_API_URL` optional) | demo server, if any | Neon                                       |
| Demo       | Served by the server (same origin)          | laptop + tunnel     | Neon                                       |
| Staging    | Served by the server (same origin)          | droplet (pending)   | Neon                                       |

- **Database:** Neon Postgres is the shared database for demos and staging.
  Local development and CI never touch it.
- **Migrations:** on push to `main`, after CI passes, GitHub Actions runs
  migrations against Neon (`DATABASE_URL_DIRECT` secret).
- **Server hosting:** there is no free cloud host for a long-lived WebSocket
  server without a card, so the server waits for the DigitalOcean droplet
  (Docker + Caddy). Until then, demos run from a laptop:
  `npm run build && NODE_ENV=production npm start` with `DATABASE_URL` set to
  Neon, exposed with a Cloudflare quick tunnel
  (`cloudflared tunnel --url http://localhost:3000`). This is for demos only,
  not classroom sessions.
- CORS allows only the server's own origin and Vercel preview URLs.
- Configuration is in `.env.example`. Real values live in GitHub Actions,
  Vercel and the server's environment, never in the repo.
