# Agent instructions

Instructions for coding agents (Claude Code, Codex, Copilot, Cursor, Gemini
and others) working in this repository. Human contributors follow the same
rules via [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Read the specifications first

The specifications in [`docs/`](docs/README.md) define intended behavior.
Before changing code, read the documents that cover the area:

| Area you are changing                    | Read                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| Anything                                 | [`docs/README.md`](docs/README.md)                   |
| `packages/engine`, scenarios, mechanics  | [`docs/GAME-RULES.md`](docs/GAME-RULES.md)           |
| `apps/server`, sockets, auth, DB, deploy | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)       |
| Event logging, payload schemas, export   | [`docs/EVENTS.md`](docs/EVENTS.md)                   |
| Screens, routes, devices, accessibility  | [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)       |
| How pieces connect                       | [`docs/INTERACTIONS.md`](docs/INTERACTIONS.md)       |
| Any file in `docs/`                      | [`docs/SPEC-GUIDELINES.md`](docs/SPEC-GUIDELINES.md) |

Cite requirement IDs (for example `ARCH-012`, `RULE-054`) in code comments,
tests and pull requests when you implement one.

## Keep specs and code in sync

- A change that alters behavior MUST update the affected spec in the same
  change (SPEC-GUIDELINES §8).
- If the code and a spec disagree, do not silently change either. Report the
  conflict and open an issue labelled `docs`.
- Do not invent rules or values. If a spec leaves something open, implement
  the smallest reasonable behavior, open an issue labelled `docs`, and
  say so in the pull request.
- Write spec text in the style defined in SPEC-GUIDELINES §4–§6.

## Architecture invariants

- The server is authoritative. Clients send intents; only the action pipeline
  writes game state (ARCH-010).
- `packages/engine` is pure and deterministic: no I/O, no `Math.random()`, no
  `Date.now()` (RULE-002).
- Clients receive full projections per audience, never diffs, and never data
  their audience may not see (ARCH-021, ARCH-024).
- Every state-changing action, accepted or rejected, is logged (EVT-001,
  EVT-003). Never log usernames or other personal information (EVT-008).

## Commands

Run from the repository root (Node 20.19+ or 22.12+; npm 11 to add
dependencies):

```sh
npm install          # install
npm run dev          # web :5173 + server :3000
npm test             # Vitest
npm run typecheck
npm run lint         # oxlint
npm run format       # Prettier (CI runs format:check)
npm run build
```

All five checks (`format:check`, `lint`, `typecheck`, `test`, `build`) must
pass before a pull request is ready.

## Workflow

- Work on a branch (`feat/`, `fix/`, `chore/`, `docs/`), never on `main`.
- One issue per pull request; link it with `Closes #N`. Keep changes small.
- Engine rule changes need tests.

## Hard rules

- This repository is public. Never commit secrets, `.env`, real player data,
  student information or private planning notes.
- New configuration variables go in `.env.example` with a comment.
- Do not modify `deploy/` or `.github/workflows/` unless the task is about
  deployment or CI.
