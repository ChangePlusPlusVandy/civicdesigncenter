# Interactions

| Field         | Value                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| Status        | Active                                                                                                       |
| Applies to    | Whole system                                                                                                 |
| Last reviewed | 2026-11-01                                                                                                   |
| Related       | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`GAME-RULES.md`](GAME-RULES.md), [`REQUIREMENTS.md`](REQUIREMENTS.md) |

## 1. Scope

Diagrams of how components, screens and game phases connect. They illustrate
the normative documents and add no requirements of their own. When a diagram
and a specification disagree, the specification wins and the diagram is a
bug.

Mermaid source below is canonical. An interactive version with per-component
details and issue links is in
[`diagrams/system-map.html`](diagrams/system-map.html); open it in a browser
from a local checkout and keep it in sync (SPEC-GUIDELINES §8).

Legend: solid nodes are implemented on `main`; dashed nodes are planned or in
review. Issue numbers name the tracking issue.

## 2. Components

```mermaid
flowchart LR
  subgraph Devices
    T["Teacher console<br/>/teach, /teach/:gameId"]
    S["Student device<br/>/city/:code"]
    P["Projector<br/>/projector/:code"]
  end

  subgraph Web["apps/web"]
    R["Router + AppLayout"]
    J["Join form"]
    A["Teacher sign-in"]
    U["useGame hook #26"]
    V["Game views #31–#37"]
  end

  subgraph Server["apps/server"]
    BA["Better Auth + game_roles #24"]
    REST["REST: /api/healthz, POST join #24"]
    WS["Socket.IO gateway #17"]
    PIPE["Action pipeline #19 #25"]
    PROJ["project(state, audience) #17"]
    STATIC["Static SPA + fallback"]
  end

  subgraph Packages["packages and data"]
    SH["@cs/shared"]
    EN["@cs/engine #15"]
    SC["Scenarios JSON #38"]
    DB[("Postgres: PGlite / Neon<br/>PR #70")]
    EX["Data export CLI #48"]
  end

  T -- "sign in" --> A --> BA
  S -- "room code, name, PIN" --> J -- "POST join" --> REST -- "player, token hash" --> DB
  T & S & P --> V
  V <--> U
  U -- "emit action" --> WS -- "actor + intent" --> PIPE
  PIPE -- "reduce()" --> EN
  SC --> EN
  PIPE -- "events + snapshot" --> DB
  PIPE -- "new state" --> PROJ -- "full state + version" --> U
  DB --> EX
  STATIC -. "serves" .-> R
  SH -. "types, schemas, can()" .-> J & PIPE

  classDef planned stroke-dasharray: 5 3
  class T,S,P,A,U,V,BA,WS,PIPE,PROJ,EN,SC,DB,EX planned
```

## 3. Action round trip

One player action, end to end (ARCHITECTURE §4).

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (useGame)
  participant G as Socket.IO gateway
  participant A as Action pipeline
  participant E as @cs/engine
  participant D as Postgres
  participant R as Audience rooms

  C->>G: emit("action", { clientActionId, type, payload })
  G->>A: actor { gameId, participantId, teamId, role } + intent
  A->>A: lock game · zod parse · de-duplicate clientActionId
  A->>A: can(role, type)
  A->>A: map team to city (teams.city_key)
  A->>E: reduce(scenario, state, { ...intent, actor, at })
  alt accepted
    E-->>A: { ok: true, state, events }
    A->>D: insert events (city ids → team_id) · update snapshot WHERE version = v
    D-->>A: commit, version v + 1
    A->>R: project(state, audience) → full state + version
    A-->>C: ack({ ok: true, version })
  else FORBIDDEN, INVALID or { ok: false, error }
    A->>D: insert one event, outcome: rejected (own transaction)
    A-->>C: ack({ ok: false, code }), state unchanged
  end
```

## 4. Screen flow

```mermaid
flowchart LR
  H["/ Home"] --> JN["/join<br/>room code + username + PIN"]
  JN -- "POST /api/games/:code/join<br/>token → localStorage" --> C["/city/:code<br/>city view"]
  C --> AU["Auction: bids, ready"]
  AU --> BU["Build: place, remove, toggle"]
  BU --> RS["Resolve: stats"]
  RS -- next round --> AU
  C -. "gift: auction, build, resolve" .-> C
  C -. "personal device" .-> PL["/play/:code<br/>student view"]

  H --> TE["/teach<br/>sign in"]
  TE --> TG["/teach/:gameId<br/>lobby, run, moderate"]
  TG -- opens --> PR["/projector/:code"]
```

## 5. Game lifecycle

```mermaid
stateDiagram-v2
  [*] --> lobby
  lobby --> auction: startGame (round 1)
  auction --> build: advancePhase
  build --> resolve: advancePhase (production, stats)
  resolve --> auction: advancePhase (round + 1)
  resolve --> ended: advancePhase, resources exhausted
  lobby --> ended: endGame
  auction --> ended: endGame
  build --> ended: endGame
  resolve --> ended: endGame
  ended --> [*]
```

`pauseGame` and `resumeGame` toggle the `paused` flag in `auction`, `build`
or `resolve` without changing the phase.

## 6. Responsibilities by phase

| Actor     | Lobby                                   | Auction                           | Build                                | Resolve                              | Ended                |
| --------- | --------------------------------------- | --------------------------------- | ------------------------------------ | ------------------------------------ | -------------------- |
| Teacher   | Assign teams; rename, kick, lock; start | Watch ready-up; advance, pause    | Advance, pause                       | Review stats; advance, pause         | Export the log (#48) |
| Player    | Join and wait                           | Change sealed bids; set ready     | Place, remove, toggle buildings      | View production and stats            | View final stats     |
| Gifts     | —                                       | Any player, no approval           | Any player, no approval              | Any player, no approval              | —                    |
| Projector | Room code, joined teams                 | Lots, ready count; no bid amounts | World map                            | City stats side by side              | Final results        |
| Engine    | Load scenario, seed RNG                 | Draw lots; resolve bids and ties  | Placement, adjacency, employment cap | Production, stats, nature, snapshot  | —                    |
| Events    | `teacher.*`, `game.started`             | `auction.*`                       | `building.*`                         | `production.building_ran`, `round.*` | `game.ended`         |

`trade.gift_sent`, `phase.advanced`, `game.paused` and `game.resumed` can
occur in `auction`, `build` and `resolve`.
