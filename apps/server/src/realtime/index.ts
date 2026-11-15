// The main game's Socket.IO gateway (docs/ARCHITECTURE.md §5, §6): auth
// middleware, rooms, and full-state projections per audience. The idle
// sandbox runs separately on the /sandbox namespace.

import { eq } from "drizzle-orm";
import type { Namespace, Server, Socket } from "socket.io";
import { project, type GameState, type Projection } from "@cs/engine";
import {
  GAME_SOCKET_EVENTS,
  type Audience,
  type SocketConnectError,
  type StateMessage,
} from "@cs/shared";
import { snapshots } from "../db/drizzle-schema.ts";
import type { Authenticator, Db, SocketSession } from "./auth.ts";
import { rooms } from "./rooms.ts";

export { anyOf, playerTokenAuth } from "./auth.ts";
export type { Authenticator, Db, Handshake, SocketSession } from "./auth.ts";
export { rooms } from "./rooms.ts";

export type Snapshot = { state: GameState; version: number };

// Reads a game's latest state, or null if it has none yet.
export type SnapshotLoader = (gameId: number) => Promise<Snapshot | null>;

export type ActionAck = (reply: unknown) => void;

// Handles one `action` message. The action pipeline (#19, #25) plugs in
// here; it validates `raw` (ARCH-081), runs the engine, saves, then calls
// `broadcast` and acks (ARCH-010, ARCH-016).
export type ActionHandler = (
  session: SocketSession,
  raw: unknown,
  ack: ActionAck,
) => void;

export type RealtimeOptions = {
  authenticate: Authenticator;
  loadSnapshot: SnapshotLoader;
  onAction?: ActionHandler;
};

type SocketData = {
  session: SocketSession;
  audience: Audience;
  // The room this socket receives its projection through.
  stateRoom: string;
};

// The latest snapshot's state and version (ARCH-052).
export function snapshotLoader(getDb: () => Promise<Db> | Db): SnapshotLoader {
  return async (gameId) => {
    const db = await getDb();
    const [row] = await db
      .select({ state: snapshots.state, version: snapshots.version })
      .from(snapshots)
      .where(eq(snapshots.game_id, gameId))
      .limit(1);
    return row ? { state: row.state as GameState, version: row.version } : null;
  };
}

// The audience a session sees, and the room it receives it through. Every
// player role sees the team view; the per-student `player` audience is
// reserved for the trade-only view (ARCHITECTURE §5). A seat without a team
// receives its (city-less) team view through its own player room.
function audienceOf(session: SocketSession): {
  audience: Audience;
  stateRoom: string;
} {
  switch (session.kind) {
    case "teacher":
      return {
        audience: { kind: "teacher" },
        stateRoom: rooms.teacher(session.gameId),
      };
    case "projector":
      return {
        audience: { kind: "projector" },
        stateRoom: rooms.projector(session.gameId),
      };
    case "player":
      return {
        audience: { kind: "team", cityId: session.cityId },
        stateRoom:
          session.teamId === null
            ? rooms.player(session.gameId, session.participantId)
            : rooms.team(session.gameId, session.teamId),
      };
  }
}

// Every room a session joins (ARCH-020).
function roomsOf(session: SocketSession): string[] {
  const game = rooms.game(session.gameId);
  switch (session.kind) {
    case "teacher":
      return [game, rooms.teacher(session.gameId)];
    case "projector":
      return [game, rooms.projector(session.gameId)];
    case "player":
      return [
        game,
        rooms.player(session.gameId, session.participantId),
        ...(session.teamId === null
          ? []
          : [rooms.team(session.gameId, session.teamId)]),
      ];
  }
}

const reject = (code: SocketConnectError) => new Error(code);

export class Realtime {
  readonly nsp: Namespace;
  // Last state broadcast per game, so a socket connecting while a newer
  // state is in flight still gets the newest one (ARCH-021).
  private readonly latest = new Map<number, Snapshot>();

  constructor(
    io: Server,
    private readonly options: RealtimeOptions,
  ) {
    this.nsp = io.of("/");

    // ARCH-080: every connection authenticates before it joins any room.
    this.nsp.use((socket, next) => {
      const handshake = {
        auth: (socket.handshake.auth ?? {}) as Record<string, unknown>,
        headers: socket.handshake.headers,
      };
      options.authenticate(handshake).then(
        (session) => {
          if (!session) return next(reject("UNAUTHORIZED"));
          const data: SocketData = { session, ...audienceOf(session) };
          socket.data = data;
          next();
        },
        (error: unknown) => {
          console.error("socket auth failed:", errorKind(error));
          next(reject("INTERNAL"));
        },
      );
    });

    this.nsp.on("connection", (socket) => void this.onConnection(socket));
  }

  private async onConnection(socket: Socket) {
    const data = socket.data as SocketData;
    if (this.options.onAction) {
      const handle = this.options.onAction;
      socket.on(GAME_SOCKET_EVENTS.action, (raw: unknown, ack?: unknown) => {
        handle(
          data.session,
          raw,
          typeof ack === "function" ? (ack as ActionAck) : () => {},
        );
      });
    }
    // Join before loading, so a broadcast during the load still arrives.
    await socket.join(roomsOf(data.session));

    // ARCH-021: the full projection with its version on every (re)connect.
    let snapshot: Snapshot | null;
    try {
      snapshot = await this.options.loadSnapshot(data.session.gameId);
    } catch (error) {
      console.error("snapshot load failed:", errorKind(error));
      return;
    }
    const cached = this.latest.get(data.session.gameId);
    if (cached && (!snapshot || cached.version > snapshot.version)) {
      snapshot = cached;
    }
    if (!snapshot || !socket.connected) return;
    socket.emit(GAME_SOCKET_EVENTS.state, message(snapshot, data.audience));
  }

  // Sends each audience in the game its full projection of `state` with
  // `version` (ARCH-021). The action pipeline calls it after every accepted
  // action is committed. Projects once per room, not per socket.
  broadcast(gameId: number, state: GameState, version: number) {
    const cached = this.latest.get(gameId);
    if (!cached || version >= cached.version) {
      this.latest.set(gameId, { state, version });
    }
    const audiences = new Map<string, Audience>();
    for (const id of this.nsp.adapter.rooms.get(rooms.game(gameId)) ?? []) {
      const socket = this.nsp.sockets.get(id);
      if (!socket) continue;
      const { stateRoom, audience } = socket.data as SocketData;
      audiences.set(stateRoom, audience);
    }
    for (const [room, audience] of audiences) {
      this.nsp
        .to(room)
        .emit(GAME_SOCKET_EVENTS.state, message({ state, version }, audience));
    }
  }

  // Disconnects a player's sockets, except those opened with `keepTokenHash`.
  // A re-join calls it with the new token's hash (ARCH-035); a kick calls it
  // without one. Returns how many sockets it closed.
  disconnectPlayer(
    gameId: number,
    participantId: string,
    keepTokenHash?: string,
  ): number {
    let closed = 0;
    const room = rooms.player(gameId, participantId);
    for (const id of [...(this.nsp.adapter.rooms.get(room) ?? [])]) {
      const socket = this.nsp.sockets.get(id);
      const session = (socket?.data as SocketData | undefined)?.session;
      if (!socket || session?.kind !== "player") continue;
      if (keepTokenHash !== undefined && session.tokenHash === keepTokenHash) {
        continue;
      }
      socket.disconnect(true);
      closed++;
    }
    return closed;
  }

  // Drops the cached state of a game that has ended or been unloaded.
  forget(gameId: number) {
    this.latest.delete(gameId);
  }
}

// A failed query's message quotes its parameters, which can include a
// token hash (ARCH-082), so only the error's code or name is logged.
function errorKind(error: unknown): string {
  const e = error as {
    cause?: { code?: unknown };
    code?: unknown;
    name?: unknown;
  };
  return String(e?.cause?.code ?? e?.code ?? e?.name ?? "unknown");
}

function message(
  { state, version }: Snapshot,
  audience: Audience,
): StateMessage<Projection> {
  return { version, state: project(state, audience) };
}
