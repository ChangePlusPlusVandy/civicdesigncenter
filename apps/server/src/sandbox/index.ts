// The idle-builder sandbox: games in memory while they're played, saved to
// the database (see store.ts) so they survive restarts, a small REST API to
// create and join them, and a Socket.IO namespace for play.

import { randomInt } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Router } from "express";
import { Server as SocketServer, type Socket } from "socket.io";
import {
  CLIENT_EVENTS,
  MAP_IDS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  type Ack,
  type ActionMessage,
  type AdminMessage,
  type CreateGameResponse,
  type GameInfoResponse,
  type JoinResponse,
  type LoggedEvent,
  type MapId,
} from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { GameRoom, type Identity } from "./room.ts";
import { MemoryStore, type GameStore } from "./store.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IDLE_ROOM_MS = 12 * 60 * 60 * 1000;
const SAVE_EVERY_MS = 1000;
const RESTORED_LOG = 5000;

export interface SandboxOptions {
  tickMs?: number;
  // Where games are saved. Defaults to memory (nothing survives a restart).
  store?: GameStore;
}

interface SocketData {
  room: GameRoom;
  identity: Identity;
}

export class Sandbox {
  readonly rooms = new Map<string, GameRoom>();
  private io: SocketServer | undefined;
  private readonly store: GameStore;
  private readonly saver: NodeJS.Timeout;
  private saving: Promise<void> = Promise.resolve();

  constructor(private readonly options: SandboxOptions = {}) {
    this.store = options.store ?? new MemoryStore();
    this.saver = setInterval(() => void this.save(), SAVE_EVERY_MS);
    this.saver.unref();
  }

  // Opens the store and brings back every game played in the last 12 hours.
  static async open(options: SandboxOptions = {}): Promise<Sandbox> {
    const sandbox = new Sandbox(options);
    await sandbox.store.init();
    for (const game of await sandbox.store.loadGames(
      Date.now() - IDLE_ROOM_MS,
    )) {
      if (game.state.phase === "ended") continue;
      const log = await sandbox.store.loadEvents(game.code, RESTORED_LOG);
      sandbox.rooms.set(
        game.code,
        new GameRoom(game.code, {
          tickMs: options.tickMs,
          restore: { game, log },
          onChange: (changed, events) => sandbox.broadcast(changed, events),
        }),
      );
    }
    return sandbox;
  }

  // Writes every changed game and its new log rows. One save at a time.
  save(): Promise<void> {
    this.saving = this.saving.then(async () => {
      for (const room of this.rooms.values()) {
        const unsaved = room.takeUnsaved();
        if (!unsaved) continue;
        try {
          await this.store.saveGame(unsaved.game);
          await this.store.appendEvents(room.code, unsaved.events);
        } catch (error) {
          console.error(`Couldn't save game ${room.code}`, error);
        }
      }
    });
    return this.saving;
  }

  create(cityCount?: number, mapId?: MapId): GameRoom {
    this.sweep();
    let code = "";
    do {
      code = Array.from(
        { length: 5 },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join("");
    } while (this.rooms.has(code));
    const room = new GameRoom(code, {
      cityCount,
      mapId,
      tickMs: this.options.tickMs,
      onChange: (changed, events) => this.broadcast(changed, events),
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: unknown): GameRoom | undefined {
    const normalized = normalizeRoomCode(
      typeof code === "string" ? code : undefined,
    );
    return normalized ? this.rooms.get(normalized) : undefined;
  }

  // Ends rooms nobody has touched in 12 hours.
  private sweep() {
    const cutoff = Date.now() - IDLE_ROOM_MS;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity < cutoff) {
        room.stop();
        this.rooms.delete(code);
      }
    }
  }

  // Saves everything, then stops. Call before the process exits.
  async close(): Promise<void> {
    clearInterval(this.saver);
    for (const room of this.rooms.values()) room.stop();
    await this.save();
    await this.store.close();
    void this.io?.close();
  }

  router(): Router {
    const router = express.Router();

    router.post("/games", (req, res) => {
      const cityCount = Number(req.body?.cityCount ?? 5);
      if (!Number.isInteger(cityCount) || cityCount < 2 || cityCount > 5) {
        res
          .status(400)
          .json({ error: "BAD_REQUEST", message: "Pick 2 to 5 cities." });
        return;
      }
      const mapId = req.body?.mapId ?? "classic";
      if (!MAP_IDS.includes(mapId)) {
        res.status(400).json({ error: "BAD_REQUEST", message: "Pick a map." });
        return;
      }
      const room = this.create(cityCount, mapId);
      const body: CreateGameResponse = {
        code: room.code,
        teacherToken: room.teacherToken ?? "",
      };
      res.status(201).json(body);
    });

    router.get("/games/:code", (req, res) => {
      const room = this.get(req.params.code);
      if (!room) {
        res
          .status(404)
          .json({ error: "NO_GAME", message: "No game has that code." });
        return;
      }
      const body: GameInfoResponse = {
        code: room.code,
        mapId: room.state.mapId,
        phase: room.state.phase,
        cities: room.state.cityIds,
      };
      res.json(body);
    });

    router.post("/games/:code/join", (req, res) => {
      const room = this.get(req.params.code);
      if (!room) {
        res.status(404).json({
          error: "NO_GAME",
          message: "No game has that code. Check with your teacher.",
        });
        return;
      }
      const joined = room.join(String(req.body?.name ?? ""));
      if ("error" in joined) {
        res.status(joined.error === "NAME_TAKEN" ? 409 : 400).json(joined);
        return;
      }
      const body: JoinResponse = {
        code: room.code,
        token: joined.token,
        playerId: joined.player.id,
        name: joined.player.name,
        cityId: joined.player.cityId,
      };
      res.status(201).json(body);
    });

    // The full research log, for the teacher, straight from the database.
    router.get("/games/:code/log", async (req, res) => {
      const room = this.teacherRoom(req);
      if (!room) {
        res
          .status(404)
          .json({ error: "NO_GAME", message: "No game, or not your game." });
        return;
      }
      await this.save();
      res.json(await this.store.loadEvents(room.code));
    });

    return router;
  }

  private teacherRoom(req: express.Request): GameRoom | undefined {
    const room = this.get(req.params.code);
    const token = req.get("authorization")?.replace(/^Bearer /, "");
    return room?.isTeacher(token) ? room : undefined;
  }

  attach(server: HttpServer): SocketServer {
    this.io = new SocketServer(server, {
      // The web client is served from the same origin (or proxied by Vite).
      cors: { origin: false },
      // Projections repeat a lot between ticks, so they compress well.
      perMessageDeflate: { threshold: 1024 },
    });
    const nsp = this.io.of(SANDBOX_NAMESPACE);

    nsp.use((socket, next) => {
      const auth = socket.handshake.auth as Record<string, unknown>;
      const room = this.get(auth.code);
      if (!room) return next(new Error("NO_GAME"));
      const identity: Identity | null =
        auth.role === "projector"
          ? { kind: "projector" }
          : room.authenticate(String(auth.token ?? ""));
      if (!identity) return next(new Error("BAD_TOKEN"));
      (socket.data as SocketData) = { room, identity };
      next();
    });

    nsp.on("connection", (socket: Socket) => {
      const { room, identity } = socket.data as SocketData;
      void socket.join(room.code);
      socket.emit(SERVER_EVENTS.state, room.projectionFor(identity));
      socket.emit(
        SERVER_EVENTS.events,
        room.visibleLog(identity).map((event) => withName(room, event)),
      );

      socket.on(
        CLIENT_EVENTS.action,
        (message: ActionMessage, ack?: (reply: Ack) => void) => {
          const current = currentIdentity(room, identity);
          let reply: Ack;
          if (!current) {
            reply = {
              ok: false,
              code: "FORBIDDEN",
              message: "You were removed from this game.",
            };
          } else if (!isActionMessage(message)) {
            reply = {
              ok: false,
              code: "BAD_REQUEST",
              message: "Malformed action.",
            };
          } else {
            reply = room.act(current, message.clientActionId, message.intent);
          }
          if (typeof ack === "function") ack(reply);
        },
      );

      socket.on(
        CLIENT_EVENTS.admin,
        (message: AdminMessage, ack?: (reply: Ack) => void) => {
          const reply: Ack =
            identity.kind === "teacher"
              ? room.admin(message)
              : {
                  ok: false,
                  code: "FORBIDDEN",
                  message: "Only the teacher can do that.",
                };
          if (typeof ack === "function") ack(reply);
        },
      );
    });

    return this.io;
  }

  // Sends every connected client its full projection after a change.
  private broadcast(room: GameRoom, events: LoggedEvent[]) {
    const nsp = this.io?.of(SANDBOX_NAMESPACE);
    if (!nsp) return;
    for (const id of nsp.adapter.rooms.get(room.code) ?? []) {
      const socket = nsp.sockets.get(id);
      if (!socket) continue;
      const data = socket.data as SocketData;
      const identity = currentIdentity(room, data.identity);
      if (!identity) {
        socket.disconnect(true);
        continue;
      }
      socket.emit(SERVER_EVENTS.state, room.projectionFor(identity));
      const visible = events
        .filter((event) => canSee(identity, event))
        .map((event) => withName(room, event));
      if (visible.length) socket.emit(SERVER_EVENTS.events, visible);
    }
  }
}

// Re-reads the player so roster changes (moved to another city, removed)
// apply immediately. Null once the player has been removed.
function currentIdentity(room: GameRoom, identity: Identity): Identity | null {
  if (identity.kind !== "player") return identity;
  const player = room.playerById(identity.player.id);
  return player ? { kind: "player", player } : null;
}

// Every event a viewer may see is either their own city's (teammates know
// each other's names) or game-wide (which has no actor), so naming is safe.
function withName(room: GameRoom, event: LoggedEvent): LoggedEvent {
  const actorName = room.nameOf(event.participantId);
  return actorName ? { ...event, actorName } : event;
}

function canSee(identity: Identity, event: LoggedEvent): boolean {
  if (identity.kind === "teacher") return true;
  if (event.outcome === "rejected") return false;
  return (
    !event.city ||
    (identity.kind === "player" && event.city === identity.player.cityId)
  );
}

function isActionMessage(value: unknown): value is ActionMessage {
  const message = value as ActionMessage | null;
  return (
    typeof message === "object" &&
    message !== null &&
    typeof message.clientActionId === "string" &&
    message.clientActionId.length > 0 &&
    message.clientActionId.length <= 64 &&
    typeof message.intent === "object" &&
    message.intent !== null &&
    typeof message.intent.type === "string"
  );
}
