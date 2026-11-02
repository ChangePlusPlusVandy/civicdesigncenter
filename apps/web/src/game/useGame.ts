import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  type Ack,
  type AdminMessage,
  type ClientIntent,
  type LoggedEvent,
  type Projection,
  type SocketAuth,
} from "@cs/idle";
import { API_URL } from "./api";

export type ConnectionStatus =
  "connecting" | "connected" | "reconnecting" | "removed" | "error";

export interface GameConnection {
  state: Projection | null;
  status: ConnectionStatus;
  // Why the connection failed: unknown game, stale token...
  error: string | null;
  events: LoggedEvent[];
  act: (intent: ClientIntent) => Promise<Ack>;
  admin: (message: AdminMessage) => Promise<Ack>;
}

const MAX_EVENTS = 200;

const CONNECT_ERRORS: Record<string, string> = {
  NO_GAME: "That game doesn't exist anymore. Ask your teacher for the code.",
  BAD_TOKEN: "This device isn't part of that game. Join again with the code.",
};

// crypto.randomUUID needs a secure context; plain-http classroom servers
// don't have one.
function actionId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function offline(message: string): Ack {
  return { ok: false, code: "OFFLINE", message };
}

interface Live {
  // Which connection this belongs to, so switching games never shows the
  // previous game's state.
  key: string;
  state: Projection | null;
  status: ConnectionStatus;
  error: string | null;
  events: LoggedEvent[];
}

// The live game for one device (#26). Holds the newest projection (older
// versions are ignored), reconnects on its own, and re-syncs on reconnect
// because the server sends the full state to every new connection.
export function useGame(auth: SocketAuth | null): GameConnection {
  const authKey = auth ? JSON.stringify(auth) : null;
  const [live, setLive] = useState<Live | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!authKey) return;
    const socket = io(`${API_URL}${SANDBOX_NAMESPACE}`, {
      auth: JSON.parse(authKey) as SocketAuth,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    const update = (change: (current: Live) => Partial<Live>) =>
      setLive((previous) => {
        const current: Live =
          previous?.key === authKey
            ? previous
            : {
                key: authKey,
                state: null,
                status: "connecting",
                error: null,
                events: [],
              };
        return { ...current, ...change(current) };
      });

    socket.on("connect", () =>
      update(() => ({ status: "connected", error: null })),
    );
    socket.on("disconnect", (reason) => {
      // The server only hangs up on purpose when a teacher removes a player.
      update(() => ({
        status: reason === "io server disconnect" ? "removed" : "reconnecting",
      }));
    });
    socket.on("connect_error", (err) => {
      const message = CONNECT_ERRORS[err.message];
      if (message) socket.disconnect();
      update(() =>
        message
          ? { status: "error", error: message }
          : { status: "reconnecting" },
      );
    });
    socket.on(SERVER_EVENTS.state, (next: Projection) => {
      update((current) => ({
        state:
          current.state && current.state.version > next.version
            ? current.state
            : next,
      }));
    });
    socket.on(SERVER_EVENTS.events, (rows: LoggedEvent[]) => {
      update((current) => ({
        events: [...current.events, ...rows].slice(-MAX_EVENTS),
      }));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authKey]);

  const send = useCallback(
    async (event: string, payload: unknown): Promise<Ack> => {
      const socket = socketRef.current;
      if (!socket?.connected) return offline("Not connected. Trying again…");
      try {
        return (await socket.timeout(5000).emitWithAck(event, payload)) as Ack;
      } catch {
        return offline("The server didn't answer. Try again.");
      }
    },
    [],
  );

  const act = useCallback(
    (intent: ClientIntent) =>
      send(CLIENT_EVENTS.action, { clientActionId: actionId(), intent }),
    [send],
  );
  const admin = useCallback(
    (message: AdminMessage) => send(CLIENT_EVENTS.admin, message),
    [send],
  );

  const current = live?.key === authKey ? live : null;
  return {
    state: current?.state ?? null,
    status: current?.status ?? "connecting",
    error: current?.error ?? null,
    events: current?.events ?? [],
    act,
    admin,
  };
}
