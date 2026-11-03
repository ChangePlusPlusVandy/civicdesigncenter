# City Settlers specifications

This folder is the specification set for City Settlers. Read it before
changing behavior. Authoring and maintenance rules are in
[`SPEC-GUIDELINES.md`](SPEC-GUIDELINES.md).

| Document                                   | Read it when you work on                                       |
| ------------------------------------------ | -------------------------------------------------------------- |
| [`REQUIREMENTS.md`](REQUIREMENTS.md)       | Scope, users, screens, devices, performance, privacy           |
| [`GAME-RULES.md`](GAME-RULES.md)           | `packages/engine`, scenarios, any game mechanic                |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)       | Server, sockets, auth, database, deployment, repository layout |
| [`EVENTS.md`](EVENTS.md)                   | The event log, payload schemas, data export                    |
| [`INTERACTIONS.md`](INTERACTIONS.md)       | How components, screens and phases connect (diagrams)          |
| [`SPEC-GUIDELINES.md`](SPEC-GUIDELINES.md) | Writing or changing any of the above                           |

An interactive version of the diagrams is in
[`diagrams/system-map.html`](diagrams/system-map.html). Open it in a browser
from a local checkout. When it opens, it reads issue and pull request state
from the public GitHub API and colors each component: all of its issues
closed (implemented), referenced by an open pull request (in review), or
otherwise planned. Offline, it shows the statuses written in the file.

Deployment runbooks live next to their configuration:
[`deploy/droplet`](../deploy/droplet/README.md) and
[`deploy/azure-appservice`](../deploy/azure-appservice/README.md) (retired;
recreation guide only).
