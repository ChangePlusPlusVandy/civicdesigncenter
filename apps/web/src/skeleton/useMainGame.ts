// The main game's live connection (ARCHITECTURE §5), walking skeleton (#19).
// Holds the newest projection, ignores older versions (ARCH-022), and sends
// intents with a clientActionId, resolving with the server's ack (ARCH-016).
// The full client hook with reconnect handling is #26.

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Projection } from "@cs/engine";
import {
  GAME_SOCKET_EVENTS,
  type ActionIntent,
  type ActionMessage,
  type ActionReply,
  type GameSocketAuth,
  type ProjectorSocketAuth,
  type StateMessage,
} from "@cs/shared";
import { API_URL } from "@/game/api";

export type MainGameAuth = GameSocketAuth | ProjectorSocketAuth;

export type MainGame<P extends Projection> = {
  latest: StateMessage<P> | null;
  connected: boolean;
  // A connect_error code (ARCH-026), or null.
  error: string | null;
  send: (intent: ActionIntent) => Promise<ActionReply>;
};

// crypto.randomUUID needs a secure context; plain-http LAN servers lack one.
function actionId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function useMainGame<P extends Projection>(
  auth: MainGameAuth | null,
): MainGame<P> {
  const [latest, setLatest] = useState<StateMessage<P> | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!auth) return;
    const options = { auth };
    const socket = API_URL ? io(API_URL, options) : io(options);
    socketRef.current = socket;
    let held = -1;

    socket.on(GAME_SOCKET_EVENTS.state, (message: StateMessage<P>) => {
      if (message.version < held) return; // ARCH-022
      held = message.version;
      setLatest(message);
    });
    socket.on("connect", () => {
      setConnected(true);
      setError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (e) => {
      setError(e.message);
      // A refused credential stays refused; stop retrying (ARCH-026).
      if (e.message === "UNAUTHORIZED") socket.disconnect();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth]);

  const send = useCallback(
    (intent: ActionIntent) =>
      new Promise<ActionReply>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          resolve({ ok: false, code: "OFFLINE" });
          return;
        }
        const message: ActionMessage = {
          ...intent,
          clientActionId: actionId(),
        };
        socket
          .timeout(5000)
          .emit(
            GAME_SOCKET_EVENTS.action,
            message,
            (err: Error | null, reply: ActionReply) =>
              resolve(err ? { ok: false, code: "TIMEOUT" } : reply),
          );
      }),
    [],
  );

  return { latest, connected, error, send };
}

// Reads a credential from the URL fragment (never sent to the server or
// written to its logs), keeps it in localStorage (ARCH-032), and removes it
// from the address bar. Falls back to the stored value after a refresh.
export function useFragmentCredential(
  param: string,
  storageKey: string,
): string | null {
  const [value] = useState(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get(
      param,
    );
    if (fromHash) {
      try {
        localStorage.setItem(storageKey, fromHash);
      } catch {
        // Blocked storage: works until a refresh.
      }
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      return fromHash;
    }
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  return value;
}
