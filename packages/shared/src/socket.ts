// The main game's Socket.IO contract (docs/ARCHITECTURE.md §5). The idle
// sandbox has its own contract in @cs/idle on the /sandbox namespace.

// Who a projection is for (ARCH-023). `cityId` is the scenario city the
// team plays, or null for a seat not yet assigned to a team (RULE-021).
// `player` is reserved for the later per-student trade-only view; today it
// receives the same data as `team` (ARCHITECTURE §5 table).
export type Audience =
  | { kind: "teacher" }
  | { kind: "projector" }
  | { kind: "team"; cityId: string | null }
  | { kind: "player"; cityId: string | null; participantId: string };

export type AudienceKind = Audience["kind"];

// What the client puts in the Socket.IO `auth` payload (ARCH-032).
export type GameSocketAuth = { token: string };

// TEMPORARY until projector sign-in exists (#24): a projector authenticates
// with the room code and the game's projector key (ARCH-036). It receives
// only the `projector` audience and cannot act.
export type ProjectorSocketAuth = { roomCode: string; projectorKey: string };

// The ack of every `action` message (ARCH-016).
export type ActionReply =
  { ok: true; version: number } | { ok: false; code: string };

export const GAME_SOCKET_EVENTS = {
  // server -> client: a full projection with its version (ARCH-021)
  state: "state",
  // client -> server: an action intent, answered by an ack (ARCH-016)
  action: "action",
} as const;

// Codes in a rejected connection's `connect_error` message (ARCH-026).
export const SOCKET_CONNECT_ERRORS = ["UNAUTHORIZED", "INTERNAL"] as const;
export type SocketConnectError = (typeof SOCKET_CONNECT_ERRORS)[number];

// Body of every `state` message. Clients discard any message whose version
// is lower than the one they hold (ARCH-022).
export type StateMessage<P> = { version: number; state: P };
