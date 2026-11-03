# Civic Design Center - City Settler project

City Settlers is a browser-based, real-time, multiplayer city-planning
simulation for classrooms. Teams each manage a city on a shared map, acquire
buildings through sealed-bid auctions, gift resources to other teams, and
balance resources against population, pollution and happiness. A projector
shows the whole world; a teacher runs the game from a facilitator console.

The first scenario is set in Nashville, built with Civic Design Center.
Scenarios are data, so educators can later adapt the game to other cities and
classrooms. Scope and requirements: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Project layout

This is an npm workspaces monorepo written in TypeScript.

```
apps/web/         React + Vite client
apps/server/      Express game server (serves the built client in production)
packages/engine/  Pure, deterministic game rules (no I/O)
packages/shared/  Types and schemas shared by web and server
```

## Development

### Requirements

- Node.js 20.19+ or 22.12+
- npm 11 when adding or upgrading dependencies (`npm install -g npm@11`).
  npm 10 can install from the existing lockfile but crashes when resolving
  new packages in this workspace.

### Local development (no Docker)

```sh
npm install
cp .env.example .env   # optional; every value has a local default
npm run dev
```

This starts the web client (Vite, http://localhost:5173) and the server
(http://localhost:3000) together. Open the web client; it forwards `/api`
and `/socket.io` to the server, so there is no CORS setup locally.

The database defaults to [PGlite](https://pglite.dev), an embedded Postgres
stored in `./.pglite/` (gitignored). Leave `DATABASE_URL` blank to use it.
Delete `./.pglite/` to reset your local data.

### Optional: Docker Postgres

If you want a real Postgres server instead:

```sh
docker compose up -d db
```

Then set `DATABASE_URL=postgres://citysettlers:citysettlers@localhost:5432/citysettlers`
in `.env`. Stop it with `docker compose down` (add `-v` to delete its data).

### Scripts

Run from the repository root:

- `npm run dev` — start the web client and server in watch mode
- `npm run build` — build the web client, then the server
- `npm start` — run the built server (set `NODE_ENV=production` to also serve the client)
- `npm test` — run all tests (Vitest)
- `npm run typecheck` — type-check every workspace
- `npm run lint` — lint with oxlint
- `npm run format` / `npm run format:check` — format with Prettier

To run a script in one workspace, use `-w`, for example `npm run dev -w apps/web`.

## Docs

The specifications in [`docs/`](docs/README.md) define intended behavior:

- [Requirements](docs/REQUIREMENTS.md): scope, users, screens, non-functional requirements
- [Game rules](docs/GAME-RULES.md): phases, auction, production, stats, gifts
- [Architecture](docs/ARCHITECTURE.md): components, action pipeline, sync, identity, environments
- [Event log](docs/EVENTS.md): research event envelope and catalog
- [Interactions](docs/INTERACTIONS.md): component, sequence, screen-flow and phase diagrams
- [Spec guidelines](docs/SPEC-GUIDELINES.md): how the specs are written and maintained
- [Contributing](CONTRIBUTING.md): workflow and reviews

Coding agents (Claude Code, Codex, Copilot, Cursor, Gemini) start from
[`AGENTS.md`](AGENTS.md).

## References

[demo slides](https://docs.google.com/presentation/d/1kzFn_MSI3Mv6gJWVl5zjCtrD4eseWc2_JONAXiQr5dg/edit?slide=id.g3849aa00bc5_0_0#slide=id.g3849aa00bc5_0_0)
| [demo video](https://drive.google.com/file/d/1D0ah9Z9wWJuTSE8RJOlgAU1nLr4a_HLn/view)
| [previous github](https://github.com/Visheshk/LC2)
| [previous hosted app](https://citysettlers.visheshk.net/)
| [research paper](https://web.archive.org/web/20260309142333/https://www.pixelplaygrounds.org/citysettlers)
