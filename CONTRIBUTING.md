# Contributing

## Workflow (GitHub Flow)

1. Every piece of work starts with an issue. Pick one assigned to you, or ask
   in the team thread before assigning yourself.
2. Branch from `main`: `feat/<short-desc>`, `fix/<short-desc>`,
   `chore/<short-desc>` or `docs/<short-desc>`.
3. Open a PR early, link the issue (`Closes #N`), and fill in the template.
4. CI must pass (`format:check`, `lint`, `typecheck`, `test`, `build`) and
   you need one approval before merging. `main` is protected.
5. Delete your branch after it merges. Merge or rebase `main` often, and flag
   overlapping work early.

## Pull requests

- Keep them small: one issue, ideally under ~400 changed lines.
- AI tools are fine. Make sure you understand and can explain every line you submit.
- Engine rule changes need tests.
- UI changes need screenshots at Chromebook size (1366×768) and tablet size.
- Update `.env.example` and the docs when configuration changes.

## Reviews

- **Until 11/1:** request **@prisn9** on every PR. The EM reviews and approves everything.
- **From 11/1:** CODEOWNERS will list owners for engine rules, auth, sockets
  and migrations. Elsewhere, one approval from any teammate is enough.
- Review within 48 hours. Check correctness, clarity, tests and maintainability.

## Async check-ins

Every **Tuesday and Thursday**, post in the team thread:

- **Done:** what you finished
- **Next:** what you're working on
- **Blocked:** anything you need (tag who can help)

Decisions and planning happen at the sync every other Sunday. Raise questions
for the PM in the thread at least a week before the sync where you need the answer.

## Secrets and data

- Never commit secrets or `.env`. Add new variables to `.env.example` with a comment.
- This repo is public. Never commit real player data or student information.

## Dependencies

Use npm 11 when adding or upgrading packages (`npm install -g npm@11`). See the README.
