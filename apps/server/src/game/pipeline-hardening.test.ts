// Pipeline hardening (#25): the per-game lock, the conditional snapshot
// update, de-duplication, can(), rejected-attempt logging and rehydration
// (ARCHITECTURE §4, §7). Calls the action handler directly on an in-memory
// database; pipeline.test.ts covers the same pipeline over real sockets.

import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@cs/engine";
import type { ActionReply, DemoGameResponse } from "@cs/shared";
import {
  events,
  games,
  players,
  snapshots,
  teams,
} from "../db/drizzle-schema.ts";
import { createTestDb, type TestDb } from "../db/helpers.ts";
import { hashToken } from "../db/tokens.ts";
import type { Db, SocketSession } from "../realtime/index.ts";
import { ActiveGames } from "./active-games.ts";
import { createDemoGame } from "./demo.ts";
import { actionPipeline } from "./pipeline.ts";

type PlayerSession = Extract<SocketSession, { kind: "player" }>;

const NOW = 1_800_000_000_000;

let db: TestDb;
const getDb = (): Db => db;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db.$client.close();
});

// A fresh demo game (lumber 4 in every city) with its own pipeline.
async function setup() {
  const demo = await createDemoGame(db, "secret");
  const [row] = await db
    .select({ id: games.game_id })
    .from(games)
    .where(eq(games.room_code, demo.roomCode));
  const gameId = row!.id;
  const activeGames = new ActiveGames(getDb);
  const broadcasts: number[] = [];
  const handler = actionPipeline({
    getDb,
    games: activeGames,
    broadcast: (_id, _state, version) => broadcasts.push(version),
    now: () => NOW,
  });
  const send = (session: SocketSession, raw: unknown) =>
    new Promise<ActionReply>((resolve) =>
      handler(session, raw, (reply) => resolve(reply as ActionReply)),
    );
  return { demo, gameId, activeGames, broadcasts, send };
}

async function sessionOf(
  demo: DemoGameResponse,
  cityId: string,
): Promise<PlayerSession> {
  const seat = demo.seats.find((s) => s.cityId === cityId)!;
  const tokenHash = hashToken(seat.token);
  const [row] = await db
    .select({
      gameId: players.game_id,
      participantId: players.participant_id,
      teamId: players.team_id,
      role: players.role,
      cityId: teams.city_key,
    })
    .from(players)
    .innerJoin(teams, eq(teams.team_id, players.team_id))
    .where(eq(players.token_hash, tokenHash));
  return { kind: "player", ...row!, tokenHash };
}

const gift = (clientActionId: string, amount = 1, to = "green") => ({
  clientActionId,
  type: "giftResource",
  payload: { to, resource: "lumber", amount },
});

const eventsOf = (gameId: number) =>
  db
    .select()
    .from(events)
    .where(eq(events.game_id, gameId))
    .orderBy(asc(events.seq));

async function snapshotOf(gameId: number) {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.game_id, gameId));
  return { version: row!.version, state: row!.state as GameState };
}

describe("per-game mutex (ARCH-011)", () => {
  it("serializes concurrent actions: no lost update, versions increase", async () => {
    const { demo, gameId, broadcasts, send } = await setup();
    const red = await sessionOf(demo, "red");
    const blue = await sessionOf(demo, "blue");

    const replies = await Promise.all([
      send(red, gift("c-1")),
      send(blue, gift("c-2")),
      send(red, gift("c-3")),
      send(blue, gift("c-4")),
    ]);

    // Each action saw the previous one's state, so all four applied.
    expect(replies).toEqual(
      [1, 2, 3, 4].map((v) => ({ ok: true, version: v })),
    );
    expect(broadcasts).toEqual([1, 2, 3, 4]);
    const snap = await snapshotOf(gameId);
    expect(snap.version).toBe(4);
    expect(snap.state.cities.red?.resources.lumber).toBe(2);
    expect(snap.state.cities.blue?.resources.lumber).toBe(2);
    expect(snap.state.cities.green?.resources.lumber).toBe(8);
    const rows = await eventsOf(gameId);
    expect(rows.map((r) => [r.seq, r.version])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });
});

describe("conditional snapshot update (ARCH-013)", () => {
  it("retries on the reloaded state when the version moved", async () => {
    const { demo, gameId, activeGames, send } = await setup();
    const red = await sessionOf(demo, "red");
    expect(await send(red, gift("v-1"))).toEqual({ ok: true, version: 1 });

    // Another writer moves the snapshot to version 2 behind the in-memory
    // copy, which still holds version 1.
    const written = await snapshotOf(gameId);
    written.state.cities.red!.resources.lumber = 10;
    await db
      .update(snapshots)
      .set({ version: 2, state: written.state })
      .where(eq(snapshots.game_id, gameId));
    expect((await activeGames.get(gameId))?.version).toBe(1);

    // The first try conflicts and writes nothing; the retry applies on the
    // reloaded version-2 state.
    expect(await send(red, gift("v-2"))).toEqual({ ok: true, version: 3 });
    const snap = await snapshotOf(gameId);
    expect(snap.version).toBe(3);
    expect(snap.state.cities.red?.resources.lumber).toBe(9);
    const rows = await eventsOf(gameId);
    expect(rows.map((r) => [r.seq, r.version, r.client_action_id])).toEqual([
      [1, 1, "v-1"],
      [2, 3, "v-2"],
    ]);
    expect(rows[1]!.payload).toMatchObject({ fromBefore: 10 });
  });

  it("checks the version for a rejected attempt too", async () => {
    const { demo, gameId, activeGames, send } = await setup();
    const red = await sessionOf(demo, "red");
    await activeGames.get(gameId);
    await db
      .update(snapshots)
      .set({ version: 5 })
      .where(eq(snapshots.game_id, gameId));

    expect(await send(red, gift("v-3", 99))).toEqual({
      ok: false,
      code: "NOT_ENOUGH_RESOURCES",
    });
    const rows = await eventsOf(gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 5, outcome: "rejected" });
  });

  it("acks INTERNAL when the version keeps moving", async () => {
    const { demo, gameId, send } = await setup();
    const red = await sessionOf(demo, "red");
    // Every load sees a version the update then misses.
    const stale = new ActiveGames(getDb);
    const real = stale.get.bind(stale);
    stale.get = async (id) => {
      const game = await real(id);
      return game && { ...game, version: game.version - 1 };
    };
    const handler = actionPipeline({
      getDb,
      games: stale,
      broadcast: () => {},
    });
    const reply = await new Promise((resolve) =>
      handler(red, gift("v-4"), resolve),
    );
    expect(reply).toEqual({ ok: false, code: "INTERNAL" });
    expect(await eventsOf(gameId)).toHaveLength(0);
    expect((await snapshotOf(gameId)).version).toBe(0);
    // The pipeline from setup() is unaffected.
    expect(await send(red, gift("v-5"))).toEqual({ ok: true, version: 1 });
  });
});

describe("clientActionId de-duplication (ARCH-012)", () => {
  it("returns the original ack and writes no second event", async () => {
    const { demo, gameId, send } = await setup();
    const red = await sessionOf(demo, "red");
    const first = await send(red, gift("d-1"));
    expect(first).toEqual({ ok: true, version: 1 });
    // A retry, concurrent with another action, after a later action.
    const [retry, other] = await Promise.all([
      send(red, gift("d-1")),
      send(red, gift("d-2")),
    ]);
    expect(retry).toEqual(first);
    expect(other).toEqual({ ok: true, version: 2 });
    expect(await send(red, gift("d-1"))).toEqual(first);

    const rows = await eventsOf(gameId);
    expect(rows.map((r) => r.client_action_id)).toEqual(["d-1", "d-2"]);
    expect((await snapshotOf(gameId)).version).toBe(2);
  });

  it("returns the original rejection for a retried rejected action", async () => {
    const { demo, gameId, send } = await setup();
    const red = await sessionOf(demo, "red");
    const first = await send(red, gift("d-3", 99));
    expect(first).toEqual({ ok: false, code: "NOT_ENOUGH_RESOURCES" });
    expect(await send(red, gift("d-3", 99))).toEqual(first);
    expect(await eventsOf(gameId)).toHaveLength(1);
  });

  it("is per participant: another player may reuse the id", async () => {
    const { demo, send } = await setup();
    const red = await sessionOf(demo, "red");
    const blue = await sessionOf(demo, "blue");
    expect(await send(red, gift("d-4"))).toEqual({ ok: true, version: 1 });
    expect(await send(blue, gift("d-4"))).toEqual({ ok: true, version: 2 });
  });
});

describe("can() (ARCH-015) and rejected attempts (ARCH-014, EVT-003)", () => {
  it("refuses a role can() does not allow and logs it", async () => {
    const { demo, gameId, send } = await setup();
    const red = { ...(await sessionOf(demo, "red")), role: "observer" };
    expect(await send(red, gift("f-1"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    const rows = await eventsOf(gameId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      seq: 1,
      version: 0,
      type: "trade.gift_sent",
      outcome: "rejected",
      error_code: "FORBIDDEN",
      actor_type: "player",
      participant_id: red.participantId,
      team_id: red.teamId,
      client_action_id: "f-1",
      payload: { fromTeam: "red", toTeam: "green", fromBefore: 4 },
    });
    expect((await snapshotOf(gameId)).version).toBe(0);
  });

  it("logs a rule rejection in its own transaction", async () => {
    const { demo, gameId, broadcasts, send } = await setup();
    const red = await sessionOf(demo, "red");
    expect(await send(red, gift("r-1", 1, "nowhere"))).toEqual({
      ok: false,
      code: expect.any(String),
    });
    const [row] = await eventsOf(gameId);
    expect(row).toMatchObject({
      outcome: "rejected",
      error_code: expect.any(String),
      payload: { toTeam: "nowhere", toBefore: 0 },
    });
    expect(broadcasts).toEqual([]);
    expect((await snapshotOf(gameId)).version).toBe(0);
  });

  it("does not log refusals that have no event to record (ARCH-019)", async () => {
    const { demo, gameId, send } = await setup();
    const red = await sessionOf(demo, "red");
    expect(await send(red, { type: "giftResource" })).toEqual({
      ok: false,
      code: "INVALID",
    });
    const teamless = { ...red, teamId: null, cityId: null };
    expect(await send(teamless, gift("n-1"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await send({ kind: "projector", gameId }, gift("n-2"))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(await eventsOf(gameId)).toHaveLength(0);
  });
});

describe("rehydration (ARCH-053)", () => {
  let demo: DemoGameResponse;
  let gameId: number;
  let endedId: number;
  beforeEach(async () => {
    ({ demo, gameId } = await setup());
    const ended = await setup();
    endedId = ended.gameId;
    await db
      .update(games)
      .set({ phase: "ended" })
      .where(eq(games.game_id, endedId));
  });

  it("loads every game that has not ended on boot", async () => {
    const activeGames = new ActiveGames(getDb);
    expect(await activeGames.rehydrate()).toBeGreaterThan(0);
    expect(activeGames.has(gameId)).toBe(true);
    expect(activeGames.has(endedId)).toBe(false);
    const loaded = await activeGames.get(gameId);
    expect(loaded).toMatchObject({
      gameId,
      scenarioId: "lc2-default",
      phase: "lobby",
      version: 0,
    });
  });

  it("serves actions and snapshots from memory after boot", async () => {
    const activeGames = new ActiveGames(getDb);
    await activeGames.rehydrate();
    const handler = actionPipeline({
      getDb,
      games: activeGames,
      broadcast: () => {},
    });
    const red = await sessionOf(demo, "red");
    const reply = await new Promise((resolve) =>
      handler(red, gift("h-1"), resolve),
    );
    expect(reply).toEqual({ ok: true, version: 1 });

    const loader = activeGames.snapshotLoader();
    const snap = await loader(gameId);
    expect(snap?.version).toBe(1);
    expect(snap?.state.cities.red?.resources.lumber).toBe(3);
    expect(await loader(-1)).toBeNull();
  });
});
