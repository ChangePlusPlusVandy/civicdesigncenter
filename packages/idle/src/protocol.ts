// The wire contract between the web client and the sandbox server.

import type { CityId, MapId } from "./map.ts";
import type {
  ErrorCode,
  GameEvent,
  PlayerIntent,
  TeacherIntent,
} from "./types.ts";

// The Socket.IO namespace the sandbox runs on.
export const SANDBOX_NAMESPACE = "/sandbox";

// Socket.IO handshake `auth`. Projectors need no token: they see public data.
export type SocketAuth =
  { code: string; token: string } | { code: string; role: "projector" };

// Any intent a client may send. The engine checks who may send which.
export type ClientIntent = PlayerIntent | TeacherIntent;

// One action as sent over the socket. The server runs a repeated clientActionId
// only once.
export interface ActionMessage {
  clientActionId: string;
  intent: ClientIntent;
}

// The server's answer to an action or admin message: the version it produced,
// or why it was refused.
export type Ack =
  | { ok: true; version: number; duplicate?: boolean }
  | {
      ok: false;
      code: ErrorCode | "FORBIDDEN" | "NO_GAME" | "OFFLINE" | "INTERNAL";
      message: string;
    };

// Server -> client events.
export const SERVER_EVENTS = {
  state: "state",
  events: "events",
} as const;

// Client -> server events.
export const CLIENT_EVENTS = {
  action: "action",
  admin: "admin",
} as const;

// Teacher-only roster changes. They aren't game rules, so the server
// handles them outside the engine.
export type AdminMessage =
  | { type: "movePlayer"; playerId: string; cityId: CityId }
  | { type: "removePlayer"; playerId: string };

// One row of the research log. Rejected attempts are logged too, with no
// change to the state (docs/ARCHITECTURE.md).
export interface LoggedEvent extends GameEvent {
  seq: number;
  tick: number;
  at: number;
  actor: "player" | "teacher" | "system";
  participantId?: string;
  outcome: "accepted" | "rejected";
  errorCode?: string;
  // Added only when sent to the actor's own team (or the teacher); never stored.
  actorName?: string;
}

// REST, under /api/sandbox.
// POST /api/sandbox/games: the number of cities (2 to 5) and the map.
export interface CreateGameRequest {
  cityCount?: number;
  mapId?: MapId;
}
// The new join code and the teacher's token. The token is shown once.
export interface CreateGameResponse {
  code: string;
  teacherToken: string;
}
// POST /api/sandbox/games/:code/join: the student's display name.
export interface JoinRequest {
  name: string;
}
// The student's token, id and assigned city.
export interface JoinResponse {
  code: string;
  token: string;
  playerId: string;
  name: string;
  cityId: CityId;
}
// GET /api/sandbox/games/:code: enough to show the join page.
export interface GameInfoResponse {
  code: string;
  mapId: MapId;
  phase: string;
  cities: CityId[];
}
// The body of every REST error.
export interface ApiError {
  error: string;
  message: string;
}
