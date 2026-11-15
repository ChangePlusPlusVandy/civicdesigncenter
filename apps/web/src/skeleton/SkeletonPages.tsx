// Walking-skeleton screens for the main game (#19, REQ-007). TEMPORARY:
// replaced by the facilitator console (#36), the city view (#32) and the
// projector view (#37) once player join and sign-in exist (#24).

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProjectorProjection, TeamProjection } from "@cs/engine";
import {
  normalizeRoomCode,
  ScenarioSchema,
  type ActionReply,
  type DemoGameResponse,
} from "@cs/shared";
import lc2Default from "../../../../scenarios/lc2-default.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/game/api";
import { useFragmentCredential, useMainGame } from "./useMainGame";

// Static scenario data (names, resources) the projections leave out.
const scenarios = new Map(
  [ScenarioSchema.parse(lc2Default)].map((s) => [s.id, s]),
);

const tokenKey = (code: string) => `citysettlers:main:player:${code}`;
const projectorKeyKey = (code: string) => `citysettlers:main:projector:${code}`;

const CONNECT_ERRORS: Record<string, string> = {
  UNAUTHORIZED: "This link is not valid for this game. Create a new game.",
  INTERNAL: "The server could not open this game. Try again.",
};

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
  );
}

function Status({
  error,
  connected,
}: {
  error: string | null;
  connected: boolean;
}) {
  if (error) {
    return (
      <p role="alert" className="text-destructive">
        {CONNECT_ERRORS[error] ?? error}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {connected ? "Connected" : "Connecting…"}
    </p>
  );
}

// `/skeleton`: creates a demo game (ARCH-063) and lists its links.
export function SkeletonHomePage() {
  const [secret, setSecret] = useState("");
  const [game, setGame] = useState<DemoGameResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/demo/games`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      if (res.status === 404) setError("Demo games are off on this server.");
      else if (res.status === 401) setError("Wrong demo secret.");
      else if (!res.ok) setError("The server could not create a game.");
      else setGame((await res.json()) as DemoGameResponse);
    } catch {
      setError("Can't reach the game server.");
    } finally {
      setBusy(false);
    }
  }

  const origin = window.location.origin;
  return (
    <Shell title="Walking skeleton">
      <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
        <label className="grid gap-1 text-sm font-semibold">
          Demo secret
          <Input
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={busy}>
          Create game
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {game ? (
        <section className="space-y-3">
          <p>
            Room code{" "}
            <span className="font-mono text-2xl font-semibold">
              {game.roomCode}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Each link carries its own credential. Open one per device; links use
            this page's address ({origin}).
          </p>
          <ul className="space-y-2">
            <li>
              <a
                className="font-semibold underline"
                href={`${origin}/skeleton/projector/${game.roomCode}#key=${game.projectorKey}`}
                target="_blank"
                rel="noreferrer"
              >
                Projector
              </a>
            </li>
            {game.seats.map((seat) => (
              <li key={seat.cityId}>
                <a
                  className="underline"
                  href={`${origin}/skeleton/city/${game.roomCode}#token=${seat.token}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {seat.cityName}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}

// `/skeleton/city/:code`: one team's view with one action, a gift (RULE-100).
export function SkeletonCityPage() {
  const code = normalizeRoomCode(useParams().code) ?? "";
  const token = useFragmentCredential("token", tokenKey(code));
  const auth = useMemo(() => (token ? { token } : null), [token]);
  const { latest, connected, error, send } = useMainGame<TeamProjection>(auth);
  const [to, setTo] = useState("");
  const [resource, setResource] = useState("");
  const [reply, setReply] = useState<ActionReply | null>(null);

  if (!token) {
    return (
      <Shell title={`Game ${code}`}>
        <p>
          Open this page from a seat link.{" "}
          <Link className="underline" to="/skeleton">
            Create a game
          </Link>
        </p>
      </Shell>
    );
  }

  const view = latest?.state;
  const scenario = view ? scenarios.get(view.scenarioId) : undefined;
  const others = scenario?.cities.filter((c) => c.id !== view?.cityId) ?? [];
  const target = to || others[0]?.id || "";
  const gift = resource || scenario?.resources[0]?.id || "";
  const cityName = (id: string | null) =>
    scenario?.cities.find((c) => c.id === id)?.name ?? id ?? "No team";

  async function giftOne() {
    setReply(null);
    setReply(
      await send({
        type: "giftResource",
        payload: { to: target, resource: gift, amount: 1 },
      }),
    );
  }

  return (
    <Shell title={view ? cityName(view.cityId) : `Game ${code}`}>
      <Status error={error} connected={connected} />
      {view?.city ? (
        <>
          <section aria-label="Resources">
            <h2 className="mb-2 text-lg font-semibold">Resources</h2>
            <ul
              className="flex flex-wrap gap-4 tabular-nums"
              data-testid="resources"
            >
              {Object.entries(view.city.resources).map(([id, amount]) => (
                <li key={id}>
                  {scenario?.resources.find((r) => r.id === id)?.name ?? id}:{" "}
                  <span className="font-semibold">{amount}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-wrap items-end gap-3" aria-label="Gift">
            <label className="grid gap-1 text-sm font-semibold">
              Resource
              <select
                className="h-10 rounded-xl border bg-card px-3"
                value={gift}
                onChange={(e) => setResource(e.target.value)}
              >
                {scenario?.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              To
              <select
                className="h-10 rounded-xl border bg-card px-3"
                value={target}
                onChange={(e) => setTo(e.target.value)}
              >
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={giftOne} disabled={!connected || !target || !gift}>
              Gift 1
            </Button>
          </section>
          <p aria-live="polite" className="text-sm">
            {reply === null
              ? ""
              : reply.ok
                ? `Sent (version ${reply.version})`
                : `Not sent: ${reply.code}`}
          </p>
        </>
      ) : view ? (
        <p>This seat has no team yet.</p>
      ) : null}
      {latest ? (
        <p className="text-xs text-muted-foreground">
          Version {latest.version}
        </p>
      ) : null}
    </Shell>
  );
}

// `/skeleton/projector/:code`: the projector projection, read-only (REQ-033).
export function SkeletonProjectorPage() {
  const code = normalizeRoomCode(useParams().code) ?? "";
  const key = useFragmentCredential("key", projectorKeyKey(code));
  const auth = useMemo(
    () => (key && code ? { roomCode: code, projectorKey: key } : null),
    [key, code],
  );
  const { latest, connected, error } = useMainGame<ProjectorProjection>(auth);

  if (!auth) {
    return (
      <Shell title={`Game ${code}`}>
        <p>Open this page from the projector link.</p>
      </Shell>
    );
  }

  const view = latest?.state;
  const scenario = view ? scenarios.get(view.scenarioId) : undefined;
  return (
    <Shell title={`Room ${code}`}>
      <Status error={error} connected={connected} />
      {view && latest ? (
        <>
          <p className="text-xl">
            Round {view.round} ·{" "}
            <span data-testid="projector-version">
              Version {latest.version}
            </span>
          </p>
          <table className="w-full text-left text-lg tabular-nums">
            <thead>
              <tr className="border-b">
                <th className="py-2">City</th>
                <th>Population</th>
                <th>Happiness</th>
                <th>Pollution</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(view.cities).map(([id, city]) => {
                const info = scenario?.cities.find((c) => c.id === id);
                return (
                  <tr key={id} className="border-b">
                    <td className="flex items-center gap-2 py-2 font-semibold">
                      <span
                        aria-hidden="true"
                        className="size-3 rounded-full"
                        style={{ background: info?.color }}
                      />
                      {info?.name ?? id}
                    </td>
                    <td>{city.stats.population}</td>
                    <td>{city.stats.happiness}</td>
                    <td>{city.stats.pollution}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}
    </Shell>
  );
}
