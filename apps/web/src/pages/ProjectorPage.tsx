import { lazy, Suspense, useMemo } from "react";
import { useParams } from "react-router-dom";
import { POLICIES } from "@cs/idle";
import { normalizeRoomCode } from "@cs/shared";
import { Leaderboards, NatureHealth } from "@/game/play/CityPanels";
import { happinessFace, panel } from "@/game/format";
import { useGame } from "@/game/useGame";
import { cn } from "@/lib/utils";
import { WebGLBoundary } from "@/world/WebGLBoundary";

const WorldCanvas = lazy(() =>
  import("@/world/WorldCanvas").then((module) => ({
    default: module.WorldCanvas,
  })),
);

// The whole-class screen. Public information only: no coins or goods.
export function ProjectorPage() {
  const code = normalizeRoomCode(useParams().code) ?? "";
  const auth = useMemo(
    () => (code ? { code, role: "projector" as const } : null),
    [code],
  );
  const { state, error } = useGame(auth);

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-xl text-muted-foreground">
        {error}
      </main>
    );
  }
  if (!state) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-xl text-muted-foreground">
        Connecting…
      </main>
    );
  }

  const lastResult = state.meetingResults.at(-1);
  const joinHost = `${window.location.host}/join`;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[linear-gradient(180deg,#e7f0ea_0%,#f6f5ee_55%,#ede3d1_100%)]">
      <div className="absolute inset-y-0 left-0 right-[26rem]">
        <WebGLBoundary>
          <Suspense fallback={null}>
            <WorldCanvas
              mode="interactive"
              cities={state.cities}
              commons={state.commons}
              tick={state.tick}
            />
          </Suspense>
        </WebGLBoundary>
        <div className={cn(panel, "absolute left-4 top-4 px-5 py-3")}>
          <p className="font-serif text-3xl tracking-tight">City Settlers</p>
          <p className="text-lg font-semibold text-muted-foreground">
            Season {state.season} · Day {state.tick}
            {state.phase === "paused"
              ? " · Paused"
              : state.phase === "ended"
                ? " · Game over"
                : ""}
          </p>
        </div>
        {state.events.length ? (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <p className={cn(panel, "px-6 py-3 text-2xl font-bold")}>
              {state.events
                .map((e) =>
                  e.kind === "drought"
                    ? "☀️ Drought!"
                    : e.kind === "festival"
                      ? "🎉 Festival!"
                      : "🌊 Flood!",
                )
                .join("  ")}
            </p>
          </div>
        ) : null}
      </div>

      <aside className="absolute inset-y-0 right-0 flex w-[26rem] flex-col gap-4 overflow-y-auto border-l bg-card p-5">
        {state.phase === "lobby" || state.phase === "running" ? (
          <section className="rounded-xl bg-primary p-4 text-primary-foreground">
            <p className="text-sm font-semibold opacity-80">
              Join at {joinHost}
            </p>
            <p
              className="font-mono text-5xl font-black tracking-[0.15em]"
              data-testid="projector-code"
            >
              {code}
            </p>
          </section>
        ) : null}

        {state.meeting ? (
          <section className="rounded-xl border-2 border-primary p-4">
            <h2 className="text-2xl font-bold">🏛️ Town Meeting</h2>
            <ul className="mt-3 space-y-2">
              {state.meeting.policyIds.map((id) => (
                <li key={id}>
                  <p className="text-lg font-bold">{POLICIES[id].name}</p>
                  <p className="text-sm text-muted-foreground">
                    {POLICIES[id].summary}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-semibold">
              Voted: {state.meeting.votedCities.length} of {state.cities.length}{" "}
              cities
            </p>
          </section>
        ) : lastResult ? (
          <section className="rounded-xl border p-4">
            <h2 className="font-bold">Season {lastResult.season} vote</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(lastResult.tally).map(([id, tally]) => (
                <li key={id} className="flex justify-between">
                  <span>
                    {lastResult.passed.includes(id as never) ? "✅" : "❌"}{" "}
                    {POLICIES[id as keyof typeof POLICIES].name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {tally?.yes}–{tally?.no}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Cities
          </h2>
          <ul className="space-y-1.5">
            {state.cities.map((city) => (
              <li
                key={city.id}
                className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"
              >
                <span
                  className="size-3 rounded-full"
                  style={{ background: city.color }}
                />
                <span className="font-bold">{city.name}</span>
                <span className="ml-auto text-sm tabular-nums">
                  👥 {city.population} · {happinessFace(city.happiness)}{" "}
                  {city.happiness}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Nature we share
          </h2>
          <NatureHealth game={state} />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Leaderboards
          </h2>
          <Leaderboards game={state} />
        </section>
      </aside>
    </div>
  );
}
