// The wire contract between the web client and the sandbox server.

import type { CityId } from "./map.ts";
import type {
  ErrorCode,
  GameEvent,
  PlayerIntent,
  TeacherIntent,
} from "./types.ts";

export const SANDBOX_NAMESPACE = "/sandbox";

// Socket.IO handshake `auth`. Projectors need no token: they see public data.
export type SocketAuth =
  { code: string; token: string } | { code: string; role: "projector" };

export type ClientIntent = PlayerIntent | TeacherIntent;

export interface ActionMessage {
  clientActionId: string;
  intent: ClientIntent;
}

export type Ack =
  | { ok: true; version: number; duplicate?: boolean }
  | { ok: false; code: ErrorCode | "FORBIDDEN" | "NO_GAME"; message: string };

// Server -> client events.
export const SERVER_EVENTS = {
  state: "state",
  events: "events",
} as const;

// Client -> server events.
export const CLIENT_EVENTS = {
  action: "action",
} as const;

export interface LoggedEvent extends GameEvent {
  seq: number;
  tick: number;
  at: number;
  actor: "player" | "teacher" | "system";
  participantId?: string;
}

// REST, under /api/sandbox.
export interface CreateGameRequest {
  cityCount?: number;
}
export interface CreateGameResponse {
  code: string;
  teacherToken: string;
}
export interface JoinRequest {
  name: string;
}
export interface JoinResponse {
  code: string;
  token: string;
  playerId: string;
  name: string;
  cityId: CityId;
}
export interface GameInfoResponse {
  code: string;
  phase: string;
  cities: CityId[];
}
export interface ApiError {
  error: string;
  message: string;
}
