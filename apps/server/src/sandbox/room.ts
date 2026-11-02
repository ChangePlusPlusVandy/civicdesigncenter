import { randomBytes, randomUUID } from "node:crypto";
import {
  TICK_MS,
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
  type Projection,
  type RosterEntry,
} from "@cs/idle";

export interface Player {
  id: string;
  token: string;
  name: string;
  cityId: CityId;
}

export type Identity =
  | { kind: "teacher" }
  | { kind: "player"; player: Player }
  | { kind: "projector" };

export interface RoomOptions {
  cityCount?: number;
  // Milliseconds per tick at speed ×1. 0 turns the timer off (tests tick by hand).
  tickMs?: number;
  onChange?: (room: GameRoom, events: LoggedEvent[]) => void;
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

const NAME_PATTERN = /^[\p{L}\p{N} _'-]{2,24}$/u;
const MAX_LOG = 5000;
const MAX_SEEN = 2000;

export class GameRoom {
  readonly teacherToken = randomBytes(18).toString("base64url");
  state: IdleState;
  version = 1;
  lastActivity = Date.now();
  readonly log: LoggedEvent[] = [];
  private readonly players = new Map<string, Player>();
  private readonly contributions = new Map<string, Contribution>();
  // clientActionId -> version it produced, so retries are safe.
  private readonly seen = new Map<string, number>();
  private seq = 0;
  private timer: NodeJS.Timeout | undefined;
  private timerInterval = 0;
  private readonly tickMs: number;
  private readonly onChange: RoomOptions["onChange"];

  constructor(
    readonly code: string,
    options: RoomOptions = {},
  ) {
    this.state = createGame(options.cityCount ?? 5);
    this.tickMs = options.tickMs ?? TICK_MS;
    this.onChange = options.onChange;
  }

  join(rawName: string): Player | { error: string; message: string } {
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
    const player: Player = {
      id: randomUUID(),
      token: randomBytes(18).toString("base64url"),
      name,
      cityId: this.smallestTeam(),
    };
    this.players.set(player.token, player);
    this.changed([]);
    return player;
  }

  // New players join the city with the fewest players.
  private smallestTeam(): CityId {
    const counts = new Map(this.state.cityIds.map((id) => [id, 0]));
    for (const player of this.players.values()) {
      counts.set(player.cityId, (counts.get(player.cityId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? "red";
  }

  authenticate(token: string): Identity | null {
    if (token === this.teacherToken) return { kind: "teacher" };
    const player = this.players.get(token);
    return player ? { kind: "player", player } : null;
  }

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

    const actor: Actor =
      identity.kind === "player"
        ? {
            kind: "player",
            cityId: identity.player.cityId,
            participantId: identity.player.id,
          }
        : { kind: "teacher" };
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

    this.state = result.state;
    this.version += 1;
    this.remember(key);
    if (participantId) this.count(participantId, intent.type);
    this.changed(this.record(result.events, actor.kind, participantId));
    this.schedule();
    return { ok: true, version: this.version };
  }

  admin(message: AdminMessage): Ack {
    const player = [...this.players.values()].find(
      (p) => p.id === message.playerId,
    );
    if (!player)
      return { ok: false, code: "NOT_FOUND", message: "No such player." };
    if (message.type === "movePlayer") {
      if (!this.state.cityIds.includes(message.cityId)) {
        return { ok: false, code: "BAD_REQUEST", message: "No such city." };
      }
      player.cityId = message.cityId;
    } else {
      this.players.delete(player.token);
    }
    this.version += 1;
    this.changed(
      this.record(
        [{ type: `teacher.${message.type}`, payload: { ...message } }],
        "teacher",
      ),
    );
    return { ok: true, version: this.version };
  }

  tick(): void {
    const result = reduce(this.state, { kind: "system" }, { type: "tick" });
    if (!result.ok) {
      this.schedule();
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

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.timerInterval = 0;
  }

  playerFor(token: string): Player | undefined {
    return this.players.get(token);
  }

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
    return [...this.players.values()].find((p) => p.id === participantId)?.name;
  }

  private count(participantId: string, type: string) {
    const key = CONTRIBUTION_KEYS[type];
    if (!key) return;
    const counts = this.contributions.get(participantId) ?? emptyContribution();
    counts[key] += 1;
    this.contributions.set(participantId, counts);
  }

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

  private record(
    events: GameEvent[],
    actor: LoggedEvent["actor"],
    participantId?: string,
    errorCode?: string,
  ): LoggedEvent[] {
    const at = Date.now();
    const rows = events.map((event) => ({
      ...event,
      seq: ++this.seq,
      tick: this.state.tick,
      at,
      actor,
      participantId,
      outcome: errorCode ? ("rejected" as const) : ("accepted" as const),
      errorCode,
    }));
    this.log.push(...rows);
    if (this.log.length > MAX_LOG)
      this.log.splice(0, this.log.length - MAX_LOG);
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
    this.onChange?.(this, events);
  }
}
