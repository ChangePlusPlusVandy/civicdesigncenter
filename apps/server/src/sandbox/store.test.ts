// Saving games: the SQL store on a real (in-memory) PGlite database, and a
// whole server restart that students and teachers come back from.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  type Ack,
  type ClientIntent,
  type CreateGameResponse,
  type JoinResponse,
  type LoggedEvent,
  type Projection,
} from "@cs/idle";
import { createApp } from "../app.ts";
import { Sandbox } from "./index.ts";
import { MemoryStore, SqlStore, type SavedGame } from "./store.ts";

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

function freshDb() {
  const lite = new PGlite();
  cleanup.push(() => lite.close());
  // Closing a sandbox must not close the shared test database.
  return { lite, store: () => new SqlStore(lite) };
}

describe("SqlStore", () => {
  it("saves and loads games and the event log", async () => {
    const { store: make } = freshDb();
    const store = make();
    await store.init();
    await store.init(); // creating the tables twice is fine

    const game = {
      code: "ABCDE",
      version: 3,
      seq: 2,
      lastActivity: Date.now(),
      teacherTokenHash: "t",
      players: [],
      contributions: {},
      state: { phase: "running" },
    } as unknown as SavedGame;
    await store.saveGame(game);
    await store.saveGame({ ...game, version: 4 });
    expect(await store.loadGames(Date.now() - 60_000)).toEqual([
      { ...game, version: 4 },
    ]);
    expect(await store.loadGames(Date.now() + 60_000)).toEqual([]);

    const row = (seq: number) =>
      ({
        seq,
        type: "x",
        tick: 0,
        at: 0,
        actor: "system",
        outcome: "accepted",
        payload: {},
      }) as LoggedEvent;
    await store.appendEvents("ABCDE", [row(1), row(2), row(3)]);
    await store.appendEvents("ABCDE", [row(3)]); // already saved: ignored
    expect((await store.loadEvents("ABCDE")).map((r) => r.seq)).toEqual([
      1, 2, 3,
    ]);
    expect((await store.loadEvents("ABCDE", 2)).map((r) => r.seq)).toEqual([
      2, 3,
    ]);
  });
});

// Fails the first write, then works, recording each batch it was given.
class FlakyStore extends MemoryStore {
  batches: number[] = [];
  private failed = false;

  override async appendEvents(code: string, rows: LoggedEvent[]) {
    this.batches.push(rows.length);
    if (!this.failed) {
      this.failed = true;
      throw new Error("connection reset");
    }
    await super.appendEvents(code, rows);
  }
}

describe("saving", () => {
  it("keeps log rows a failed save didn't write, and writes in batches", async () => {
    const store = new FlakyStore();
    const sandbox = new Sandbox({ store, tickMs: 0 });
    cleanup.push(() => sandbox.close());
    const room = sandbox.create(2);
    for (let i = 0; i < 2500; i++) room.reject({ kind: "teacher" });

    const quiet = console.error;
    console.error = () => {};
    try {
      await sandbox.save();
    } finally {
      console.error = quiet;
    }
    expect(await store.loadEvents(room.code)).toEqual([]);

    room.reject({ kind: "teacher" }); // logged while the database was down
    await sandbox.save();
    const saved = await store.loadEvents(room.code);
    expect(saved).toHaveLength(2501);
    expect(saved.map((row) => row.seq)).toEqual(
      Array.from({ length: 2501 }, (_, i) => i + 1),
    );
    expect(Math.max(...store.batches)).toBeLessThanOrEqual(1000);
  });
});

async function serve(sandbox: Sandbox) {
  const server: Server = createServer(createApp({ sandbox }));
  sandbox.attach(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  cleanup.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

async function connect(base: string, code: string, token: string) {
  const socket: Socket = io(`${base}${SANDBOX_NAMESPACE}`, {
    auth: { code, token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  cleanup.push(() => void socket.disconnect());
  let latest: Projection | null = null;
  socket.on(SERVER_EVENTS.state, (state: Projection) => (latest = state));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  const waitFor = async (check: (state: Projection) => boolean) => {
    for (let i = 0; i < 200; i++) {
      if (latest && check(latest)) return latest;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timed out");
  };
  const act = (
    intent: ClientIntent,
    clientActionId = `a${++actions}`,
  ): Promise<Ack> =>
    socket
      .timeout(2000)
      .emitWithAck(CLIENT_EVENTS.action, { clientActionId, intent });
  return { socket, waitFor, act };
}

// Unique across connections, like the real client's random ids.
let actions = 0;

describe("restarting the server", () => {
  it("brings games back, paused, with tokens and the log intact", async () => {
    const { lite, store } = freshDb();

    // A class plays on the first server…
    const first = await Sandbox.open({ store: store(), tickMs: 0 });
    let base = await serve(first);
    const post = async <T>(path: string, body: unknown) =>
      (await (
        await fetch(`${base}/api/sandbox${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).json()) as T;
    const { code, teacherToken } = await post<CreateGameResponse>("/games", {
      cityCount: 2,
      mapId: "nashville",
    });
    const ana = await post<JoinResponse>(`/games/${code}/join`, {
      name: "Ana",
    });
    const teacher = await connect(base, code, teacherToken);
    await teacher.act({ type: "start" });
    const student = await connect(base, code, ana.token);
    await student.waitFor((p) => p.phase === "running");
    const farm: ClientIntent = {
      type: "build",
      payload: { kind: "farm", x: 6, y: 2 },
    };
    expect(await student.act(farm, "farm-1")).toMatchObject({ ok: true });
    await first.close();

    // Raw tokens never reach the database.
    const dump = JSON.stringify(
      (await lite.query("SELECT data FROM sandbox_games")).rows,
    );
    expect(dump).not.toContain(ana.token);
    expect(dump).not.toContain(teacherToken);

    // …and carries on after a restart.
    const second = await Sandbox.open({ store: store(), tickMs: 0 });
    cleanup.push(() => second.close());
    base = await serve(second);
    const back = await connect(base, code, ana.token);
    const restored = await back.waitFor(() => true);
    expect(restored.mapId).toBe("nashville");
    expect(restored.phase).toBe("paused");
    expect(restored.me?.name).toBe("Ana");
    expect(restored.myCity?.buildings.some((b) => b.kind === "farm")).toBe(
      true,
    );
    // A retry that was waiting when the server went down isn't run twice.
    expect(await back.act(farm, "farm-1")).toMatchObject({
      ok: true,
      duplicate: true,
    });

    const teacherAgain = await connect(base, code, teacherToken);
    expect(await teacherAgain.act({ type: "resume" })).toMatchObject({
      ok: true,
    });
    await back.waitFor((p) => p.phase === "running");

    const log = (await (
      await fetch(`${base}/api/sandbox/games/${code}/log`, {
        headers: { authorization: `Bearer ${teacherToken}` },
      })
    ).json()) as LoggedEvent[];
    const types = log.map((row) => row.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "game.started",
        "building.built",
        "game.restored",
      ]),
    );
    expect(new Set(log.map((row) => row.seq)).size).toBe(log.length);
    expect(types.filter((type) => type === "building.built")).toHaveLength(1);
  });
});
