// The idle-builder sandbox: in-memory games, a small REST API to create and
// join them, and a Socket.IO namespace for play. A server restart ends every
// game; persistence comes with the database work (#70).

import { randomInt } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import express, { type Router } from "express";
import { Server as SocketServer, type Socket } from "socket.io";
import {
  CLIENT_EVENTS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  type Ack,
  type ActionMessage,
  type AdminMessage,
  type CreateGameResponse,
  type GameInfoResponse,
  type JoinResponse,
  type LoggedEvent,
} from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { GameRoom, type Identity } from "./room.ts";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const IDLE_ROOM_MS = 12 * 60 * 60 * 1000;

export interface SandboxOptions {
  tickMs?: number;
}

interface SocketData {
  room: GameRoom;
  identity: Identity;
}

export class Sandbox {
  readonly rooms = new Map<string, GameRoom>();
  private io: SocketServer | undefined;

  constructor(private readonly options: SandboxOptions = {}) {}

  create(cityCount?: number): GameRoom {
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

  close() {
    for (const room of this.rooms.values()) room.stop();
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
      const room = this.create(cityCount);
      const body: CreateGameResponse = {
        code: room.code,
        teacherToken: room.teacherToken,
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
        playerId: joined.id,
        name: joined.name,
        cityId: joined.cityId,
      };
      res.status(201).json(body);
    });

    // The full research log, for the teacher (and future data export).
    router.get("/games/:code/log", (req, res) => {
      const room = this.get(req.params.code);
      const token = req.get("authorization")?.replace(/^Bearer /, "");
      if (!room || token !== room.teacherToken) {
        res
          .status(404)
          .json({ error: "NO_GAME", message: "No game, or not your game." });
        return;
      }
      res.json(room.log);
    });

    return router;
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
      socket.emit(SERVER_EVENTS.events, room.visibleLog(identity));

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
      const visible = events.filter((event) => canSee(identity, event));
      if (visible.length) socket.emit(SERVER_EVENTS.events, visible);
    }
  }
}

// Re-reads the player so roster changes (moved to another city, removed)
// apply immediately. Null once the player has been removed.
function currentIdentity(room: GameRoom, identity: Identity): Identity | null {
  if (identity.kind !== "player") return identity;
  const player = room.playerFor(identity.player.token);
  return player ? { kind: "player", player } : null;
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
