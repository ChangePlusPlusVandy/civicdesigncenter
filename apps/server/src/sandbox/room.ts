import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  SCHEMA_VERSION,
  TICK_MS,
  catalogProblem,
  createGame,
  project,
  reduce,
  type Ack,
  type Actor,
  type AdminMessage,
  type CityId,
  type ClientIntent,
  type Contribution,
  type GameEvent,
  type IdleState,
  type LoggedEvent,
  type MapId,
  type Projection,
  type RosterEntry,
} from "@cs/idle";
import type { SavedGame, SavedPlayer } from "./store.ts";

// A student in a game, as the room keeps them.
export type Player = SavedPlayer;

// Who a connection is: the teacher, a student, or the read-only projector.
export type Identity =
  | { kind: "teacher" }
  | { kind: "player"; player: Player }
  | { kind: "projector" };

// How a room starts: a new game, or one restored from the database.
export interface RoomOptions {
  cityCount?: number;
  mapId?: MapId;
  // Milliseconds per tick at speed ×1. 0 turns the timer off (tests tick by hand).
  tickMs?: number;
  onChange?: (room: GameRoom, events: LoggedEvent[]) => void;
  // Picks up a saved game instead of starting a new one.
  restore?: { game: SavedGame; log: LoggedEvent[] };
}

const CONTRIBUTION_KEYS: Record<string, keyof Contribution> = {
  build: "builds",
  upgrade: "upgrades",
  proposeTrade: "trades",
  acceptTrade: "trades",
  marketBuy: "market",
  marketSell: "market",
  vote: "votes",
  reflect: "reflections",
};

function emptyContribution(): Contribution {
  return {
    builds: 0,
    upgrades: 0,
    trades: 0,
    market: 0,
    votes: 0,
    reflections: 0,
  };
}

// SHA-256 of a join token, as hex. Only hashes are stored.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const newToken = () => randomBytes(18).toString("base64url");

const NAME_PATTERN = /^[\p{L}\p{N} _'-]{2,24}$/u;
const MAX_LOG = 5000;
const MAX_SEEN = 2000;

// One game: its state, players, research log and tick timer. Every change goes
// through act(), admin() or tick(), which apply the rules, log the result
// (EVT-001, EVT-003) and notify onChange so the server can broadcast new
// projections (ARCH-021).
export class GameRoom {
  // Only known right after creating the game; the server keeps just a hash.
  readonly teacherToken: string | null;
  private readonly teacherTokenHash: string;
  state: IdleState;
  version = 1;
  lastActivity = Date.now();
  readonly log: LoggedEvent[] = [];
  // By token hash.
  private readonly players = new Map<string, Player>();
  private readonly contributions = new Map<string, Contribution>();
  // clientActionId -> version it produced, so retries are safe.
  private readonly seen = new Map<string, number>();
  private seq = 0;
  private timer: NodeJS.Timeout | undefined;
  private timerInterval = 0;
  private readonly tickMs: number;
  private readonly onChange: RoomOptions["onChange"];
  // Waiting to be saved.
  private dirty = true;
  private unsaved: LoggedEvent[] = [];

  constructor(
    readonly code: string,
    options: RoomOptions = {},
  ) {
    this.tickMs = options.tickMs ?? TICK_MS;
    this.onChange = options.onChange;
    const saved = options.restore?.game;
    if (saved) {
      this.teacherToken = null;
      this.teacherTokenHash = saved.teacherTokenHash;
      this.state = saved.state;
      this.version = saved.version;
      this.seq = saved.seq;
      this.lastActivity = saved.lastActivity;
      for (const player of saved.players)
        this.players.set(player.tokenHash, player);
      for (const [id, counts] of Object.entries(saved.contributions)) {
        this.contributions.set(id, counts);
      }
      // Older saves have no retry keys.
      for (const [key, version] of saved.seen ?? [])
        this.seen.set(key, version);
      this.log.push(...(options.restore?.log ?? []));
      this.dirty = false;
      this.resumeAfterRestart();
    } else {
      this.teacherToken = newToken();
      this.teacherTokenHash = hashToken(this.teacherToken);
      this.state = createGame(options.cityCount ?? 5, options.mapId);
    }
  }

  // A game that was running when the server stopped comes back paused, so
  // the teacher picks the moment to carry on.
  private resumeAfterRestart() {
    const events: GameEvent[] = [
      { type: "game.restored", payload: { version: this.version } },
    ];
    if (this.state.phase === "running") {
      const paused = reduce(this.state, { kind: "teacher" }, { type: "pause" });
      if (paused.ok) {
        this.state = paused.state;
        events.push(...paused.events);
      }
    }
    this.version += 1;
    this.record(events, "system");
  }

  // Adds a student under a unique display name and puts them in the city with
  // the fewest players. Returns the player and their token, or an error code
  // and message. Names never go into the log (EVT-008).
  join(
    rawName: string,
  ): { player: Player; token: string } | { error: string; message: string } {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!NAME_PATTERN.test(name)) {
      return {
        error: "BAD_NAME",
        message: "Use 2–24 letters, numbers or spaces.",
      };
    }
    const taken = [...this.players.values()].some(
      (player) => player.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
      return {
        error: "NAME_TAKEN",
        message: "Someone already has that name. Try another.",
      };
    }
    if (this.state.phase === "ended") {
      return { error: "GAME_ENDED", message: "This game has ended." };
    }
    const token = newToken();
    const player: Player = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      name,
      cityId: this.smallestTeam(),
    };
    this.players.set(player.tokenHash, player);
    this.version += 1;
    this.changed(
      this.record(
        [{ type: "player.joined", city: player.cityId, payload: {} }],
        "system",
        player.id,
      ),
    );
    return { player, token };
  }

  // New players join the city with the fewest players.
  private smallestTeam(): CityId {
    const counts = new Map(this.state.cityIds.map((id) => [id, 0]));
    for (const player of this.players.values()) {
      counts.set(player.cityId, (counts.get(player.cityId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? "red";
  }

  // True if the token is this game's teacher token.
  isTeacher(token: string | undefined): boolean {
    return Boolean(token) && hashToken(token ?? "") === this.teacherTokenHash;
  }

  // The teacher or student a token belongs to, or null if it belongs to nobody.
  authenticate(token: string): Identity | null {
    if (this.isTeacher(token)) return { kind: "teacher" };
    const player = this.players.get(hashToken(token));
    return player ? { kind: "player", player } : null;
  }

  // Runs one validated action through the rules engine and returns the ack. A
  // repeated clientActionId returns the earlier result instead of running
  // again. Accepted and rejected attempts are both logged (EVT-001, EVT-003).
  act(identity: Identity, clientActionId: string, intent: ClientIntent): Ack {
    this.lastActivity = Date.now();
    if (identity.kind === "projector") {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "The projector can only watch.",
      };
    }
    const key = `${identity.kind === "player" ? identity.player.id : "teacher"}:${clientActionId}`;
    const earlier = this.seen.get(key);
    if (earlier !== undefined)
      return { ok: true, version: earlier, duplicate: true };

    const actor = actorOf(identity);
    const participantId =
      identity.kind === "player" ? identity.player.id : undefined;
    const result = reduce(this.state, actor, intent);

    if (!result.ok) {
      this.record(
        [
          {
            type: intent.type,
            city: actor.kind === "player" ? actor.cityId : undefined,
            payload: { intent },
          },
        ],
        actor.kind,
        participantId,
        result.error.code,
      );
      return {
        ok: false,
        code: result.error.code,
        message: result.error.message,
      };
    }

    // The engine's events must match the catalog before anything is kept
    // (EVT-010). A mismatch is a bug: fail the action, change nothing.
    const problem = firstProblem(result.events, "accepted");
    if (problem) {
      console.error(
        `Event outside the catalog in game ${this.code}: ${problem}`,
      );
      return { ok: false, code: "INTERNAL", message: "Something went wrong." };
    }

    this.state = result.state;
    this.version += 1;
    this.remember(key);
    if (participantId) this.count(participantId, intent.type);
    this.changed(this.record(result.events, actor.kind, participantId));
    this.schedule();
    return { ok: true, version: this.version };
  }

  // A message that didn't parse (ARCH-081). Logged as an attempt (EVT-003)
  // without anything the client sent, so junk can't fill the log.
  reject(identity: Identity): Ack {
    const reply: Ack = {
      ok: false,
      code: "BAD_REQUEST",
      message: "Malformed action.",
    };
    if (identity.kind === "projector") return reply;
    this.lastActivity = Date.now();
    const actor = actorOf(identity);
    this.record(
      [
        {
          type: "action.invalid",
          city: actor.kind === "player" ? actor.cityId : undefined,
          payload: {},
        },
      ],
      actor.kind,
      identity.kind === "player" ? identity.player.id : undefined,
      reply.code,
    );
    return reply;
  }

  // Applies a teacher roster change (move or remove a student), logs it and
  // returns the ack.
  admin(message: AdminMessage): Ack {
    const player = this.playerById(message.playerId);
    if (!player)
      return { ok: false, code: "NOT_FOUND", message: "No such player." };
    let event: GameEvent;
    if (message.type === "movePlayer") {
      if (!this.state.cityIds.includes(message.cityId)) {
        return { ok: false, code: "BAD_REQUEST", message: "No such city." };
      }
      event = {
        type: "teacher.player_moved",
        city: message.cityId,
        payload: {
          playerId: player.id,
          before: player.cityId,
          after: message.cityId,
        },
      };
      player.cityId = message.cityId;
    } else if (message.type === "removePlayer") {
      event = {
        type: "teacher.player_removed",
        city: player.cityId,
        payload: { playerId: player.id, city: player.cityId },
      };
      this.players.delete(player.tokenHash);
    } else {
      return { ok: false, code: "BAD_REQUEST", message: "Unknown change." };
    }
    this.version += 1;
    this.changed(this.record([event], "teacher"));
    return { ok: true, version: this.version };
  }

  // Advances the game one production step. Called by the timer while the game
  // is running.
  tick(): void {
    const result = reduce(this.state, { kind: "system" }, { type: "tick" });
    if (!result.ok) {
      this.schedule();
      return;
    }
    const problem = firstProblem(result.events, "accepted");
    if (problem) {
      console.error(
        `Event outside the catalog in game ${this.code}: ${problem}`,
      );
      return;
    }
    this.state = result.state;
    this.version += 1;
    this.changed(this.record(result.events, "system"));
  }

  // Runs the tick timer only while the game is running, at its speed.
  schedule(): void {
    const interval =
      this.state.phase === "running" && this.tickMs > 0
        ? this.tickMs / this.state.speed
        : 0;
    if (interval === this.timerInterval) return;
    this.stop();
    if (interval) {
      this.timer = setInterval(() => this.tick(), interval);
      this.timerInterval = interval;
    }
  }

  // Stops the tick timer.
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.timerInterval = 0;
  }

  // The student with this id, or undefined if they were removed.
  playerById(id: string): Player | undefined {
    return [...this.players.values()].find((player) => player.id === id);
  }

  // Every student with their city and what they have done, for the teacher.
  roster(): RosterEntry[] {
    return [...this.players.values()].map((player) => ({
      playerId: player.id,
      name: player.name,
      cityId: player.cityId,
      contribution: this.contributions.get(player.id) ?? emptyContribution(),
    }));
  }

  // Who did something, for teammates' activity feeds. Names never go into the
  // research log; they're added only on the way out to the same team.
  nameOf(participantId: string | undefined): string | undefined {
    if (!participantId) return undefined;
    return this.playerById(participantId)?.name;
  }

  private count(participantId: string, type: string) {
    const key = CONTRIBUTION_KEYS[type];
    if (!key) return;
    const counts = this.contributions.get(participantId) ?? emptyContribution();
    counts[key] += 1;
    this.contributions.set(participantId, counts);
  }

  // The full state this viewer may see, at the current version (ARCH-021,
  // ARCH-024).
  projectionFor(identity: Identity): Projection {
    const audience =
      identity.kind === "player"
        ? {
            kind: "player" as const,
            cityId: identity.player.cityId,
            playerId: identity.player.id,
            name: identity.player.name,
          }
        : { kind: identity.kind };
    return project(this.state, audience, this.version, this.roster());
  }

  // Events a given audience may see: their own city's and game-wide ones.
  visibleLog(identity: Identity, limit = 50): LoggedEvent[] {
    const rows =
      identity.kind === "teacher"
        ? this.log
        : this.log.filter(
            (row) =>
              row.outcome === "accepted" &&
              (!row.city ||
                (identity.kind === "player" &&
                  row.city === identity.player.cityId)),
          );
    return rows.slice(-limit);
  }

  // Everything needed to bring this game back after a restart.
  snapshot(): SavedGame {
    return {
      code: this.code,
      state: this.state,
      version: this.version,
      teacherTokenHash: this.teacherTokenHash,
      players: [...this.players.values()],
      contributions: Object.fromEntries(this.contributions),
      seq: this.seq,
      lastActivity: this.lastActivity,
      seen: [...this.seen],
    };
  }

  // What changed since the last save, or null if nothing did.
  takeUnsaved(): { game: SavedGame; events: LoggedEvent[] } | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return { game: this.snapshot(), events: this.unsaved.splice(0) };
  }

  // Puts back rows a failed save took, ahead of anything logged since, so
  // the next save retries them.
  restoreUnsaved(events: LoggedEvent[]): void {
    this.unsaved.unshift(...events);
    this.dirty = true;
  }

  private record(
    events: GameEvent[],
    actor: LoggedEvent["actor"],
    participantId?: string,
    errorCode?: string,
  ): LoggedEvent[] {
    const outcome: LoggedEvent["outcome"] = errorCode ? "rejected" : "accepted";
    const problem = firstProblem(events, outcome);
    if (problem) throw new Error(`Event outside the catalog: ${problem}`);
    const at = Date.now();
    const rows = events.map((event) => ({
      ...event,
      seq: ++this.seq,
      tick: this.state.tick,
      at,
      actor,
      participantId,
      outcome,
      errorCode,
      schemaVersion: SCHEMA_VERSION,
    }));
    this.log.push(...rows);
    if (this.log.length > MAX_LOG)
      this.log.splice(0, this.log.length - MAX_LOG);
    this.unsaved.push(...rows);
    this.dirty = true;
    return rows;
  }

  private remember(key: string) {
    this.seen.set(key, this.version);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  private changed(events: LoggedEvent[]) {
    this.dirty = true;
    this.onChange?.(this, events);
  }
}

function actorOf(identity: Identity & { kind: "teacher" | "player" }): Actor {
  return identity.kind === "player"
    ? {
        kind: "player",
        cityId: identity.player.cityId,
        participantId: identity.player.id,
      }
    : { kind: "teacher" };
}

// The first event that doesn't match the catalog, described, or null.
function firstProblem(
  events: GameEvent[],
  outcome: LoggedEvent["outcome"],
): string | null {
  for (const event of events) {
    const problem = catalogProblem(event, outcome);
    if (problem) return problem;
  }
  return null;
}
