// Simulates a classroom of students against a running server, to check the
// game holds up with a full class (#30) and to fill a game for demos.
//
//   npm run bots -- --create --players 30 --minutes 2
//   npm run bots -- --code ABCDE --players 20
//
// Options: --url (default http://localhost:3000), --code or --create,
// --players (20), --minutes (2), --speed (1, 2 or 4 with --create).

import { parseArgs } from "node:util";
import { io, type Socket } from "socket.io-client";
import {
  BUILDABLE,
  CLIENT_EVENTS,
  GOODS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  cityInfo,
  placementProblem,
  plotTiles,
  type Ack,
  type BuildableKind,
  type ClientIntent,
  type CreateGameResponse,
  type JoinResponse,
  type PrivateCity,
  type Projection,
} from "@cs/idle";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    code: { type: "string" },
    create: { type: "boolean", default: false },
    players: { type: "string", default: "20" },
    minutes: { type: "string", default: "2" },
    speed: { type: "string", default: "1" },
  },
});

const url = values.url;
const players = Number(values.players);
const minutes = Number(values.minutes);

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${url}/api/sandbox${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function connect(code: string, token: string): Socket {
  return io(`${url}${SANDBOX_NAMESPACE}`, {
    auth: { code, token },
    transports: ["websocket"],
  });
}

function act(socket: Socket, intent: ClientIntent, id: string): Promise<Ack> {
  return socket
    .timeout(5000)
    .emitWithAck(CLIENT_EVENTS.action, { clientActionId: id, intent });
}

// A reasonable student: feeds the city, builds homes, sells extra, trades.
function decide(
  state: Projection,
  city: PrivateCity,
  turn: number,
): ClientIntent | null {
  const build = (kind: BuildableKind): ClientIntent | null => {
    const tile = plotTiles(cityInfo(city.id)).find(
      ({ x, y }) => placementProblem(city, kind, x, y) === null,
    );
    return tile
      ? { type: "build", payload: { kind, x: tile.x, y: tile.y } }
      : null;
  };
  const count = (kind: BuildableKind) =>
    city.buildings.filter((b) => b.kind === kind).length;

  const incoming = state.offers.find(
    (o) => o.to === city.id && o.status === "open",
  );
  if (incoming) {
    return turn % 2
      ? { type: "acceptTrade", payload: { offerId: incoming.id } }
      : { type: "declineTrade", payload: { offerId: incoming.id } };
  }
  if (city.goods.food < city.population)
    return (
      build("farm") ?? {
        type: "marketBuy",
        payload: { good: "food", amount: 5 },
      }
    );
  if (city.population >= city.housing - 1) return build("house") ?? null;
  for (const kind of [
    "lumber-camp",
    "clay-pit",
    "fishing-dock",
    "park",
  ] as const) {
    if (count(kind) === 0) {
      const intent = build(kind);
      if (intent) return intent;
    }
  }
  if (city.goods.wood < 12)
    return { type: "marketBuy", payload: { good: "wood", amount: 5 } };
  const rich = GOODS.find((good) => city.goods[good] > 60);
  if (rich) return { type: "marketSell", payload: { good: rich, amount: 10 } };
  if (turn % 7 === 0) {
    const other = state.cities.find((c) => c.id !== city.id);
    if (other)
      return {
        type: "proposeTrade",
        payload: { to: other.id, give: { wood: 2 }, get: { coins: 4 } },
      };
  }
  const kind = BUILDABLE[turn % BUILDABLE.length];
  return kind ? build(kind) : null;
}

async function main() {
  let code = values.code?.toUpperCase();
  let teacher: Socket | null = null;
  if (values.create) {
    const game = await post<CreateGameResponse>("/games", { cityCount: 5 });
    code = game.code;
    teacher = connect(code, game.teacherToken);
    await new Promise((resolve) => teacher?.once(SERVER_EVENTS.state, resolve));
    await act(teacher, { type: "start" }, "start");
    const speed = Number(values.speed);
    if (speed === 2 || speed === 4)
      await act(teacher, { type: "setSpeed", payload: { speed } }, "speed");
    console.log(
      `Created and started game ${code} (teacher token ${game.teacherToken})`,
    );
  }
  if (!code) throw new Error("Pass --code ABCDE or --create");

  const outcomes = new Map<string, number>();
  const latencies: number[] = [];
  const tickGaps: number[] = [];
  let states = 0;
  let lastTick = -1;
  let lastTickAt = 0;

  const sockets: Socket[] = [];
  for (let i = 0; i < players; i++) {
    const joined = await post<JoinResponse>(`/games/${code}/join`, {
      name: `Bot ${String(i + 1).padStart(2, "0")}`,
    });
    const socket = connect(code, joined.token);
    sockets.push(socket);
    let latest: Projection | null = null;
    socket.on(SERVER_EVENTS.state, (state: Projection) => {
      states++;
      latest = state;
      if (i === 0 && state.tick !== lastTick) {
        const now = Date.now();
        if (lastTick >= 0) tickGaps.push(now - lastTickAt);
        lastTick = state.tick;
        lastTickAt = now;
      }
    });

    let turn = i;
    const loop = async () => {
      const state = latest as Projection | null;
      if (state?.myCity && state.phase === "running") {
        const intent = decide(state, state.myCity, turn++);
        if (intent) {
          const started = Date.now();
          const ack = await act(
            socket,
            intent,
            `${joined.playerId}-${turn}`,
          ).catch(() => null);
          latencies.push(Date.now() - started);
          const key = ack ? (ack.ok ? "ok" : ack.code) : "TIMEOUT";
          outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
        }
      }
      // Students act every 1.5–3 seconds.
      setTimeout(loop, 1500 + ((i * 397) % 1500));
    };
    setTimeout(loop, 500 + i * 50);
  }
  console.log(
    `${players} bots joined ${code}; playing for ${minutes} minute(s)…`,
  );

  await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));

  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const avgGap =
    tickGaps.reduce((a, b) => a + b, 0) / Math.max(tickGaps.length, 1);
  console.log(`\nResults for ${code}`);
  console.log(
    `  actions: ${latencies.length} (${[...outcomes].map(([k, v]) => `${k} ${v}`).join(", ")})`,
  );
  console.log(
    `  ack latency ms: p50 ${pct(0.5)}, p95 ${pct(0.95)}, max ${sorted.at(-1) ?? 0}`,
  );
  console.log(`  state messages received: ${states}`);
  console.log(
    `  ticks seen: ${tickGaps.length + 1}, average gap ${Math.round(avgGap)} ms`,
  );

  for (const socket of sockets) socket.disconnect();
  teacher?.disconnect();
  const failed =
    (outcomes.get("TIMEOUT") ?? 0) + (outcomes.get("OFFLINE") ?? 0);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
