// Integration test over real sockets and an in-memory database: auth,
// rooms, and per-audience projections (ARCHITECTURE §5, §6).

import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { createInitialState, type GameState } from "@cs/engine";
import {
  GAME_SOCKET_EVENTS,
  ScenarioSchema,
  type StateMessage,
} from "@cs/shared";
import lc2 from "../../../../scenarios/lc2-default.json";
import { players, snapshots } from "../db/drizzle-schema.ts";
import {
  createTestDb,
  makeGame,
  makePlayer,
  makeTeam,
  type TestDb,
} from "../db/helpers.ts";
import { hashToken } from "../db/tokens.ts";
import {
  anyOf,
  playerTokenAuth,
  Realtime,
  snapshotLoader,
  type Authenticator,
  type Db,
} from "./index.ts";

const scenario = ScenarioSchema.parse(lc2);

// Stand-in until teacher and projector sign-in exist (#24): a test-only
// authenticator keyed by a fixed secret.
const testStaff: Authenticator = async ({ auth }) => {
  if (auth.secret !== "staff-secret" || typeof auth.gameId !== "number") {
    return null;
  }
  return auth.as === "teacher"
    ? { kind: "teacher", gameId: auth.gameId, teacherId: "t1" }
    : { kind: "projector", gameId: auth.gameId };
};

type Msg = StateMessage<Record<string, unknown>>;

let db: TestDb;
let http: HttpServer;
let realtime: Realtime;
let url: string;
const sockets: Socket[] = [];
const ids = { game: 0, redPlayer: "" };
let state: GameState;

beforeAll(async () => {
  db = await createTestDb();
  const game = await makeGame(db);
  const other = await makeGame(db);
  const red = await makeTeam(db, game.game_id, { city_key: "red" });
  const green = await makeTeam(db, game.game_id, { city_key: "green" });
  const otherRed = await makeTeam(db, other.game_id, { city_key: "red" });
  const p = (game_id: number, team_id: number | null, token: string) =>
    makePlayer(db, game_id, { team_id, token_hash: hashToken(token) });
  ids.game = game.game_id;
  ids.redPlayer = (await p(game.game_id, red.team_id, "red-1")).participant_id;
  await p(game.game_id, red.team_id, "red-2");
  await p(game.game_id, green.team_id, "green-1");
  await p(game.game_id, null, "lobby-1");
  await p(other.game_id, otherRed.team_id, "other-red");
  await makePlayer(db, game.game_id, {
    token_hash: hashToken("kicked"),
    kicked_at: new Date(),
  });

  state = createInitialState(scenario, 7);
  for (const game_id of [game.game_id, other.game_id]) {
    await db.insert(snapshots).values({ game_id, version: 3, state });
  }

  http = createServer();
  const getDb = (): Db => db;
  realtime = new Realtime(new Server(http), {
    authenticate: anyOf(playerTokenAuth(getDb), testStaff),
    loadSnapshot: snapshotLoader(getDb),
    // Echoes the session, standing in for the action pipeline (#19, #25).
    onAction: (session, raw, ack) => ack({ session, raw }),
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) =>
    realtime.nsp.server.close(() => resolve()),
  );
  await db.$client.close();
});

// Connects and resolves with the first state message, or rejects with the
// connect_error message.
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

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("auth middleware (ARCH-080)", () => {
  it.each([
    ["no token", {}],
    ["an unknown token", { token: "nope" }],
    ["a kicked player's token", { token: "kicked" }],
    ["a non-string token", { token: 42 }],
  ])("rejects %s with UNAUTHORIZED", async (_name, auth) => {
    await expect(join(auth).first).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("projections on connect (ARCH-021, ARCH-024)", () => {
  it("sends a team seat its own city only, with the version", async () => {
    const { first } = join({ token: "red-1" });
    const msg = await first;
    expect(msg.version).toBe(3);
    expect(msg.state).toMatchObject({ audience: "team", cityId: "red" });
    expect(msg.state).not.toHaveProperty("cities");
    expect(msg.state).not.toHaveProperty("rng");
  });

  it("sends a seat without a team a city-less view", async () => {
    const msg = await join({ token: "lobby-1" }).first;
    expect(msg.state).toMatchObject({ audience: "team", city: null });
  });

  it("sends the projector stats only and the teacher everything", async () => {
    const projector = await join({
      secret: "staff-secret",
      as: "projector",
      gameId: ids.game,
    }).first;
    expect(projector.state.audience).toBe("projector");
    expect(JSON.stringify(projector.state)).not.toContain("resources");

    const teacher = await join({
      secret: "staff-secret",
      as: "teacher",
      gameId: ids.game,
    }).first;
    expect(teacher.state).toMatchObject({ audience: "teacher", ...state });
  });
});

describe("broadcast (ARCH-020, ARCH-021)", () => {
  it("sends every audience of the game its projection, and no other game", async () => {
    const red1 = join({ token: "red-1" });
    const red2 = join({ token: "red-2" });
    const green = join({ token: "green-1" });
    const teacher = join({
      secret: "staff-secret",
      as: "teacher",
      gameId: ids.game,
    });
    const otherGame = join({ token: "other-red" });
    await Promise.all(
      [red1, red2, green, teacher, otherGame].map((c) => c.first),
    );

    const next = structuredClone(state);
    next.cities.red!.resources.lumber = 99;
    next.cities.green!.resources.lumber = 55;
    const pending = [red1, red2, green, teacher].map((c) =>
      nextState(c.socket),
    );
    realtime.broadcast(ids.game, next, 4);
    const [r1, r2, g, t] = await Promise.all(pending);

    for (const m of [r1, r2, g, t]) expect(m!.version).toBe(4);
    expect(r1!.state).toMatchObject({ city: { resources: { lumber: 99 } } });
    expect(r2!.state).toEqual(r1!.state);
    expect(g!.state).toMatchObject({
      cityId: "green",
      city: { resources: { lumber: 55 } },
    });
    expect(JSON.stringify(g!.state)).not.toContain("99");
    expect(t!.state).toMatchObject({ audience: "teacher" });

    await settle();
    expect(otherGame.received).toHaveLength(1); // only its connect message
  });

  it("sends a reconnecting socket the newest version", async () => {
    const msg = await join({ token: "red-1" }).first;
    expect(msg.version).toBe(4); // the broadcast above, not the snapshot row
  });
});

describe("action hook", () => {
  it("hands the pipeline the server-side session, with role (ARCH-031)", async () => {
    const { socket, first } = join({ token: "red-2" });
    await first;
    const reply = (await socket.emitWithAck(GAME_SOCKET_EVENTS.action, {
      type: "giftResource",
    })) as { session: Record<string, unknown>; raw: unknown };
    expect(reply.raw).toEqual({ type: "giftResource" });
    expect(reply.session).toMatchObject({
      kind: "player",
      gameId: ids.game,
      cityId: "red",
      role: "seat",
    });
  });
});

describe("re-join (ARCH-035)", () => {
  it("disconnects sockets opened with the previous token", async () => {
    const old = join({ token: "red-1" });
    await old.first;
    const closed = new Promise((resolve) =>
      old.socket.once("disconnect", resolve),
    );

    // What the re-join endpoint (#24) does: overwrite the hash (ARCH-033),
    // then close the old sockets.
    await db
      .update(players)
      .set({ token_hash: hashToken("red-1-new") })
      .where(eq(players.participant_id, ids.redPlayer));
    const fresh = join({ token: "red-1-new" });
    await fresh.first;
    realtime.disconnectPlayer(ids.game, ids.redPlayer, hashToken("red-1-new"));

    await closed;
    expect(fresh.socket.connected).toBe(true);
    await expect(join({ token: "red-1" }).first).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });
});
