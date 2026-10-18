# Civic Design Center - City Settler project

City Settlers is a multiplayer city simulation for youth and classrooms. Small
teams share a map, place buildings on a grid, bid for them in auctions, trade
resources, and balance money against pollution, population, and happiness.

The first target is a Nashville-based game. Over time, the platform can support
educators customizing the experience for their own cities and classrooms.

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

### Quickstart

```sh
npm install
npm run dev
```

This starts the web client (Vite, http://localhost:5173) and the server
(http://localhost:3000) together.

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

## References

[demo slides](https://docs.google.com/presentation/d/1kzFn_MSI3Mv6gJWVl5zjCtrD4eseWc2_JONAXiQr5dg/edit?slide=id.g3849aa00bc5_0_0#slide=id.g3849aa00bc5_0_0)
| [demo video](https://drive.google.com/file/d/1D0ah9Z9wWJuTSE8RJOlgAU1nLr4a_HLn/view)
| [previous github](https://github.com/Visheshk/LC2)
| [previous hosted app](https://citysettlers.visheshk.net/)
| [research paper](https://web.archive.org/web/20260309142333/https://www.pixelplaygrounds.org/citysettlers)
