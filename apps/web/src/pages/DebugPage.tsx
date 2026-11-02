import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { SocketAuth } from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { loadSession } from "@/game/session";
import { useGame } from "@/game/useGame";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  connected: "bg-primary/15 text-primary",
  connecting: "bg-secondary text-muted-foreground",
  reconnecting: "bg-accent text-accent-foreground",
  removed: "bg-destructive/10 text-destructive",
  error: "bg-destructive/10 text-destructive",
};

// Raw projection and live event log for whoever this browser is in the game
// (teacher, player, or the public projector view if neither) (#26).
export function DebugPage() {
  const code = normalizeRoomCode(useParams().code) ?? "";
  const [as, setAs] = useState<"auto" | "projector">("auto");

  const auth = useMemo<SocketAuth | null>(() => {
    if (!code) return null;
    if (as === "projector") return { code, role: "projector" };
    const session = loadSession(code, "teacher") ?? loadSession(code, "player");
    return session
      ? { code, token: session.token }
      : { code, role: "projector" };
  }, [code, as]);
  const { state, status, error, events } = useGame(auth);

  return (
    <div className="min-h-dvh bg-background p-4 font-mono text-xs">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="font-sans font-bold">
          City Settlers
        </Link>
        <span className="font-sans text-muted-foreground">
          Debug · room {code || "?"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-sans font-semibold",
            STATUS_STYLES[status],
          )}
          data-testid="debug-status"
        >
          {status}
        </span>
        {state ? (
          <span>
            v{state.version} · {state.audience} · {state.phase} · tick{" "}
            {state.tick} · season {state.season}
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded border px-2 py-1 font-sans"
          onClick={() => setAs(as === "auto" ? "projector" : "auto")}
        >
          View as {as === "auto" ? "projector" : "this device"}
        </button>
      </header>
      {error ? (
        <p className="mt-3 font-sans text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_28rem]">
        <section>
          <h2 className="mb-2 font-sans text-sm font-bold">Projection</h2>
          <pre className="max-h-[80dvh] overflow-auto rounded-lg border bg-card p-3">
            {state ? JSON.stringify(state, null, 2) : "Waiting for state…"}
          </pre>
        </section>
        <section>
          <h2 className="mb-2 font-sans text-sm font-bold">
            Event log ({events.length})
          </h2>
          <ol className="max-h-[80dvh] space-y-1 overflow-auto rounded-lg border bg-card p-3">
            {[...events].reverse().map((event) => (
              <li
                key={event.seq}
                className={cn(
                  event.outcome === "rejected" && "text-destructive",
                )}
              >
                #{event.seq} t{event.tick} {event.actor}
                {event.city ? `/${event.city}` : ""} {event.type}
                {event.errorCode ? ` ✗ ${event.errorCode}` : ""}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
