// Walking skeleton (#19), end to end over real sockets and an in-memory
// database: a player's gift goes socket -> engine -> DB transaction ->
// broadcast, and the projector receives the new projection (ARCHITECTURE §4,
// §5).

import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import type { GameState } from "@cs/engine";
import {
  GAME_SOCKET_EVENTS,
  type ActionReply,
  type DemoGameResponse,
  type StateMessage,
} from "@cs/shared";
import { createApp } from "../app.ts";
import { events, games, snapshots } from "../db/drizzle-schema.ts";
import { createTestDb, type TestDb } from "../db/helpers.ts";
import {
  anyOf,
  playerTokenAuth,
  Realtime,
  snapshotLoader,
  type Db,
} from "../realtime/index.ts";
import { demoRouter } from "./demo.ts";
import { actionPipeline } from "./pipeline.ts";
import { projectorKeyAuth } from "./projector.ts";

type Msg = StateMessage<Record<string, unknown>>;

const SECRET = "test-session-secret";
const DEMO_SECRET = "test-demo-secret";
const NOW = 1_800_000_000_000;

let db: TestDb;
let http: HttpServer;
let realtime: Realtime;
let url: string;
let game: DemoGameResponse;
let gameId: number;
const sockets: Socket[] = [];

beforeAll(async () => {
  db = await createTestDb();
  const getDb = (): Db => db;
  http = createServer(
    createApp({
      demo: demoRouter({
        getDb,
        demoSecret: DEMO_SECRET,
        projectorSecret: SECRET,
      }),
    }),
  );
  realtime = new Realtime(new Server(http), {
    authenticate: anyOf(
      playerTokenAuth(getDb),
      projectorKeyAuth(getDb, SECRET),
    ),
    loadSnapshot: snapshotLoader(getDb),
    onAction: actionPipeline({
      getDb,
      broadcast: (id, state, version) => realtime.broadcast(id, state, version),
      now: () => NOW,
    }),
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;

  const res = await fetch(`${url}/api/demo/games`, {
    method: "POST",
    headers: { authorization: `Bearer ${DEMO_SECRET}` },
  });
  expect(res.status).toBe(201);
  game = (await res.json()) as DemoGameResponse;
  const [row] = await db
    .select({ id: games.game_id })
    .from(games)
    .where(eq(games.room_code, game.roomCode));
  gameId = row!.id;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) =>
    realtime.nsp.server.close(() => resolve()),
  );
  await db.$client.close();
});

function join(auth: Record<string, unknown>) {
  const socket = connect(url, {
    auth,
    transports: ["websocket"],
    reconnection: false,
  });
  sockets.push(socket);
  const received: Msg[] = [];
  socket.on(GAME_SOCKET_EVENTS.state, (m: Msg) => received.push(m));
  const first = new Promise<Msg>((resolve, reject) => {
    socket.once(GAME_SOCKET_EVENTS.state, resolve);
    socket.once("connect_error", (e) => reject(new Error(e.message)));
  });
  return { socket, received, first };
}

const nextState = (socket: Socket) =>
  new Promise<Msg>((resolve) => socket.once(GAME_SOCKET_EVENTS.state, resolve));

const send = (socket: Socket, message: unknown) =>
  socket
    .timeout(5000)
    .emitWithAck(GAME_SOCKET_EVENTS.action, message) as Promise<ActionReply>;

const seat = (cityId: string) => {
  const found = game.seats.find((s) => s.cityId === cityId);
  if (!found) throw new Error(`no seat for ${cityId}`);
  return found;
};

const projectorAuth = () => ({
  roomCode: game.roomCode,
  projectorKey: game.projectorKey,
});

const gift = (clientActionId: string, amount: number) => ({
  clientActionId,
  type: "giftResource",
  payload: { to: "green", resource: "lumber", amount },
});

describe("demo game creation (ARCH-063)", () => {
  it("refuses a missing or wrong secret", async () => {
    for (const authorization of [undefined, "Bearer nope", DEMO_SECRET]) {
      const res = await fetch(`${url}/api/demo/games`, {
        method: "POST",
        headers: authorization ? { authorization } : {},
      });
      expect(res.status).toBe(401);
    }
  });

  it("creates one seat per city and a version-0 snapshot", async () => {
    expect(game.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(game.seats.map((s) => s.cityId).sort()).toEqual([
      "blue",
      "green",
      "pink",
      "red",
      "yellow",
    ]);
    const [row] = await db
      .select({ version: snapshots.version })
      .from(snapshots)
      .where(eq(snapshots.game_id, gameId));
    expect(row?.version).toBe(0);
  });
});

describe("projector sign-in (ARCH-036)", () => {
  it.each([
    ["a wrong key", { roomCode: "ABCDEF", projectorKey: "x" }],
    ["no key", { roomCode: "ABCDEF" }],
  ])("refuses %s", async (_name, auth) => {
    await expect(join(auth).first).rejects.toThrow("UNAUTHORIZED");
  });

  it("refuses a tampered key", async () => {
    const auth = { ...projectorAuth(), projectorKey: `${game.projectorKey}x` };
    await expect(join(auth).first).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("one action end to end (#19)", () => {
  it("gift -> engine -> events + snapshot -> projector projection", async () => {
    const projector = join(projectorAuth());
    const red = join({ token: seat("red").token });
    const green = join({ token: seat("green").token });
    const [p0, r0, g0] = await Promise.all([
      projector.first,
      red.first,
      green.first,
    ]);
    expect(p0.version).toBe(0);
    expect(p0.state).toMatchObject({ audience: "projector" });
    expect(r0.state).toMatchObject({ audience: "team", cityId: "red" });
    expect(g0.state).toMatchObject({ audience: "team", cityId: "green" });

    const projectorNext = nextState(projector.socket);
    const greenNext = nextState(green.socket);
    const reply = await send(red.socket, gift("skeleton-1", 1));
    expect(reply).toEqual({ ok: true, version: 1 });

    // ARCH-021: every audience receives its full projection with the version.
    const p1 = await projectorNext;
    expect(p1.version).toBe(1);
    expect(p1.state).toMatchObject({ audience: "projector" });
    // ARCH-024, REQ-032: no team resources, seed or RNG on the projector.
    expect(JSON.stringify(p1.state)).not.toContain("resources");
    expect(p1.state).not.toHaveProperty("rng");
    const g1 = await greenNext;
    expect(g1).toMatchObject({
      version: 1,
      state: { city: { resources: { lumber: 5 } } },
    });

    // One applied event and the snapshot, written together.
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.game_id, gameId))
      .orderBy(asc(events.seq));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      seq: 1,
      version: 1,
      type: "trade.gift_sent",
      outcome: "applied",
      error_code: null,
      actor_type: "player",
      client_action_id: "skeleton-1",
      round: 1,
      payload: {
        fromTeam: "red",
        toTeam: "green",
        resource: "lumber",
        amount: 1,
        fromBefore: 4,
        toBefore: 4,
      },
    });
    expect(rows[0]!.participant_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0]!.team_id).not.toBeNull();

    const [snap] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.game_id, gameId));
    expect(snap?.version).toBe(1);
    const state = snap?.state as GameState;
    expect(state.cities.red?.resources.lumber).toBe(3);
    expect(state.cities.green?.resources.lumber).toBe(5);

    // ARCH-021: a projector that connects now gets the new version.
    const late = await join(projectorAuth()).first;
    expect(late.version).toBe(1);
  });

  it("logs a rule rejection without changing the state (ARCH-014)", async () => {
    const red = join({ token: seat("red").token });
    await red.first;
    const reply = await send(red.socket, gift("skeleton-2", 99));
    expect(reply).toEqual({ ok: false, code: "NOT_ENOUGH_RESOURCES" });

    const rows = await db
      .select()
      .from(events)
      .where(eq(events.game_id, gameId))
      .orderBy(asc(events.seq));
    expect(rows.at(-1)).toMatchObject({
      seq: 2,
      version: 1,
      outcome: "rejected",
      error_code: "NOT_ENOUGH_RESOURCES",
      payload: { amount: 99, fromBefore: 3, toBefore: 5 },
    });
    const [snap] = await db
      .select({ version: snapshots.version })
      .from(snapshots)
      .where(eq(snapshots.game_id, gameId));
    expect(snap?.version).toBe(1);
  });

  it("acks INVALID for a malformed message (ARCH-081)", async () => {
    const red = join({ token: seat("red").token });
    await red.first;
    expect(await send(red.socket, { type: "giftResource" })).toEqual({
      ok: false,
      code: "INVALID",
    });
  });

  it("refuses every action from the projector (REQ-033)", async () => {
    const projector = join(projectorAuth());
    await projector.first;
    const before = await db.$count(events, eq(events.game_id, gameId));
    expect(await send(projector.socket, gift("skeleton-3", 1))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await db.$count(events, eq(events.game_id, gameId))).toBe(before);
  });
});
