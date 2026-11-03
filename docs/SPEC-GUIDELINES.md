# Specification guidelines

| Field         | Value                                            |
| ------------- | ------------------------------------------------ |
| Status        | Active                                           |
| Applies to    | Every file in `docs/`, `AGENTS.md`, `README.md`  |
| Last reviewed | 2026-11-02                                       |
| Related       | [`docs/README.md`](README.md), `CONTRIBUTING.md` |

## 1. Purpose

This document defines how City Settlers specifications are written, reviewed
and kept current. The specifications in `docs/` are the source of truth for
**intended** behavior. The code is the source of truth for **current**
behavior. GitHub issues are the source of truth for **planned work**,
**open questions** and the **history of decisions**.

A specification describes the expected final system as it stands. It does
not record how a decision was reached, list unresolved questions, or narrate
changes; those belong in issues, pull requests and the git history.

## 2. Document set

| Document                             | Defines                                                         | ID prefix |
| ------------------------------------ | --------------------------------------------------------------- | --------- |
| [`REQUIREMENTS.md`](REQUIREMENTS.md) | Product scope, users, interfaces, non-functional requirements   | `REQ`     |
| [`GAME-RULES.md`](GAME-RULES.md)     | Game state, phases, auction, production, stats, trading         | `RULE`    |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Components, action pipeline, sync, identity, data, environments | `ARCH`    |
| [`EVENTS.md`](EVENTS.md)             | Research event log: envelope, enumerations, event catalog       | `EVT`     |
| [`INTERACTIONS.md`](INTERACTIONS.md) | Component, sequence, screen-flow and phase diagrams             | —         |
| `SPEC-GUIDELINES.md` (this file)     | Authoring and maintenance rules                                 | —         |

A new specification MUST be added to this table and to
[`docs/README.md`](README.md) in the same pull request that creates it.

## 3. Document structure

Every specification MUST contain, in order:

1. A title (`# <Name>`).
2. A header table with `Status`, `Applies to`, `Last reviewed` (ISO date) and
   `Related` (issues and documents).
3. A `Scope` section stating what the document covers and what it does not.
4. Numbered normative sections (`## 2. …`, `## 3. …`).

A specification MUST NOT contain an open-questions section, decision
rationale or change notes (§1). Where a value is not yet fixed, the
specification names the scenario field or issue that supplies it.

Allowed `Status` values:

| Status       | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `Draft`      | Under active change; implementation MAY start against it.                |
| `Active`     | Agreed; changes require a pull request reviewed by the EM.               |
| `Frozen`     | Locked for a milestone; changes require EM approval on the pull request. |
| `Superseded` | Replaced; the header MUST link the replacement.                          |

## 4. Normative language

- The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY**
  are used as defined in RFC 2119 and RFC 8174. They are normative only when
  written in capitals.
- Each requirement is one sentence or one bullet, and states one testable
  condition.
- Requirements that carry an ID use the document's prefix and a zero-padded
  number, for example `ARCH-007`. IDs MUST NOT be renumbered or reused. A
  withdrawn requirement keeps its ID and is marked `Withdrawn (#N)`.
- Code, tests, issues and pull requests SHOULD cite requirement IDs when they
  implement or change one.

## 5. Implementation status

Every component, requirement group or feature that is not fully implemented on
`main` MUST carry one status tag:

| Tag              | Meaning                                         |
| ---------------- | ----------------------------------------------- |
| `Implemented`    | Present on `main` and covered by tests or CI.   |
| `In review (#N)` | Implemented in open pull request `#N`.          |
| `Planned (#N)`   | Specified; tracked by issue `#N`; not started.  |
| `Deferred`       | Out of the current milestone; kept for context. |

## 6. Writing style

- Write in the present tense and the active voice: "The server rejects the
  action", not "The action will be rejected".
- Prefer tables for enumerations, field lists, state transitions and
  mappings.
- State units and ranges explicitly: `4–8 characters`, `integer ≥ 0`,
  `1366×768 px`.
- Put identifiers, routes, event types, file paths and commands in backticks.
- Use defined terms consistently. The canonical terms are: **game**, **team**
  (a city), **player**, **teacher**, **projector**, **round**, **phase**,
  **lot**, **building**, **cell**, **plot**, **resource**, **gift**,
  **projection**, **audience**, **event**, **snapshot**.
- Do not use marketing language, speculation or first person.
- Reference issues as `#N` and pull requests as `PR #N`.

## 7. Content restrictions

The repository is public. Specifications MUST NOT contain:

- Secrets, connection strings, tokens or account identifiers.
- Names or any personal information of students or playtest participants.
- Private planning material: staffing, assignments, personal accounts or
  internal negotiations.
- Copied third-party source code or assets whose license has not been
  confirmed.

## 8. Change control

1. A pull request that changes behavior MUST update the affected
   specification in the same pull request.
2. A specification change without a matching code change MUST mark the
   affected items `Planned (#N)`.
3. A product decision made in a sync, a stakeholder meeting or an issue thread
   MUST be written into the affected specifications as normative text. The
   issue or pull request records the decision and its date.
4. When code and specification disagree, the contributor MUST NOT silently
   change either one. Open an issue and label it `docs`.
5. Diagrams in [`INTERACTIONS.md`](INTERACTIONS.md) MUST be updated in the
   same pull request as the behavior they depict. Mermaid source is
   canonical; `docs/diagrams/system-map.html` MUST be regenerated or edited to
   match.
6. `Last reviewed` is updated whenever a document is checked end to end, not
   on every edit.

## 9. Audit procedure

An audit compares the specifications with the code on `main`, open pull
requests, open issues and recorded stakeholder decisions. It runs at every
milestone boundary and before every spec freeze.

1. For each document, check every `Implemented` and `In review` tag against
   the code.
2. Check every enumeration (phases, roles, outcomes, actor types, event
   types) against its zod schema or database enum.
3. Write every decision taken since the last audit into the normative text.
4. File one issue labelled `docs` per remaining discrepancy or open
   question.
5. Update `Last reviewed`.

## 10. Review checklist for specification changes

- [ ] Header table complete; `Status` is one of the allowed values.
- [ ] New requirements have unique IDs; no IDs renumbered.
- [ ] Status tags match `main` and open pull requests.
- [ ] Enumerations match their schemas.
- [ ] No open questions, decision rationale or change notes in the text.
- [ ] Diagrams updated.
- [ ] No secrets, personal information or private planning material.
- [ ] `npm run format:check` passes.
