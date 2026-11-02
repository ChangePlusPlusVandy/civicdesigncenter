// End-to-end over real sockets: a teacher and five students on one server,
// checking that everyone stays in sync and private data stays private.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import {
  CLIENT_EVENTS,
  SANDBOX_NAMESPACE,
  SERVER_EVENTS,
  type Ack,
  type AdminMessage,
  type ClientIntent,
  type CreateGameResponse,
  type JoinResponse,
  type LoggedEvent,
  type Projection,
  type SocketAuth,
} from "@cs/idle";
import { createApp } from "../app.ts";
import { Sandbox } from "./index.ts";

interface Harness {
  sandbox: Sandbox;
  server: Server;
  baseUrl: string;
}

const open: { harness?: Harness; clients: Client[] } = { clients: [] };

afterEach(async () => {
  for (const client of open.clients) client.socket.disconnect();
  open.clients = [];
  open.harness?.sandbox.close();
  await new Promise<void>(
    (resolve) => open.harness?.server.close(() => resolve()) ?? resolve(),
  );
  open.harness = undefined;
});

async function start(tickMs = 0): Promise<Harness> {
  const sandbox = new Sandbox({ tickMs });
  const server = createServer(createApp({ sandbox }));
  sandbox.attach(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const harness = {
    sandbox,
    server,
    baseUrl: `http://localhost:${(server.address() as AddressInfo).port}`,
  };
  open.harness = harness;
  return harness;
}

async function post<T>(
  harness: Harness,
  path: string,
  body: unknown,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${harness.baseUrl}/api/sandbox${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

class Client {
  latest: Projection | null = null;
  events: LoggedEvent[] = [];
  private actions = 0;

  constructor(readonly socket: Socket) {
    socket.on(SERVER_EVENTS.state, (projection: Projection) => {
      // Clients ignore anything older than what they already have.
      if (!this.latest || projection.version >= this.latest.version)
        this.latest = projection;
    });
    socket.on(SERVER_EVENTS.events, (rows: LoggedEvent[]) =>
      this.events.push(...rows),
    );
  }

  get state(): Projection {
    if (!this.latest) throw new Error("no state yet");
    return this.latest;
  }

  act(
    intent: ClientIntent,
    clientActionId = `a${++this.actions}`,
  ): Promise<Ack> {
    return this.socket
      .timeout(2000)
      .emitWithAck(CLIENT_EVENTS.action, { clientActionId, intent });
  }

  admin(message: AdminMessage): Promise<Ack> {
    return this.socket.timeout(2000).emitWithAck(CLIENT_EVENTS.admin, message);
  }

  async waitFor(
    check: (state: Projection) => boolean,
    timeout = 2000,
  ): Promise<Projection> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.latest && check(this.latest)) return this.latest;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `timed out; last state v${this.latest?.version} phase ${this.latest?.phase}`,
    );
  }
}

async function connect(harness: Harness, auth: SocketAuth): Promise<Client> {
  const socket = io(`${harness.baseUrl}${SANDBOX_NAMESPACE}`, {
    auth,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  const client = new Client(socket);
  open.clients.push(client);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  await client.waitFor(() => true);
  return client;
}

async function classroom(
  harness: Harness,
  names = ["Ana", "Ben", "Cy", "Dee", "Eli"],
) {
  const created = await post<CreateGameResponse>(harness, "/games", {
    cityCount: 5,
  });
  const { code, teacherToken } = created.body;
  const teacher = await connect(harness, { code, token: teacherToken });
  const joined: JoinResponse[] = [];
  for (const name of names) {
    joined.push(
      (await post<JoinResponse>(harness, `/games/${code}/join`, { name })).body,
    );
  }
  const students = await Promise.all(
    joined.map((j) => connect(harness, { code, token: j.token })),
  );
  return { code, teacherToken, teacher, students, joined };
}

describe("sandbox over sockets", () => {
  it("spreads a class across cities and gives everyone the same game", async () => {
    const h = await start();
    const { teacher, students, joined } = await classroom(h);

    expect(new Set(joined.map((j) => j.cityId)).size).toBe(5);
    expect(teacher.state.audience).toBe("teacher");
    expect(teacher.state.allCities).toHaveLength(5);
    for (const [i, student] of students.entries()) {
      expect(student.state.me?.cityId).toBe(joined[i]?.cityId);
      expect(student.state.myCity?.id).toBe(joined[i]?.cityId);
      expect(student.state.phase).toBe("lobby");
    }

    expect(await teacher.act({ type: "start" })).toMatchObject({ ok: true });
    await Promise.all(
      students.map((s) => s.waitFor((p) => p.phase === "running")),
    );
  });

  it("shows one student's building to everyone, but keeps coins private", async () => {
    const h = await start();
    const { teacher, students, joined } = await classroom(h);
    await teacher.act({ type: "start" });
    const ana = students[0] as Client;
    const ben = students[1] as Client;
    const anaCity = joined[0]?.cityId;
    await ana.waitFor((p) => p.phase === "running");

    const farmTile = {
      red: [3, 3],
      green: [9, 2],
      pink: [12, 8],
      blue: [13, 12],
      yellow: [2, 13],
    }[anaCity ?? "red"] ?? [0, 0];
    const ack = await ana.act({
      type: "build",
      payload: { kind: "farm", x: farmTile[0] ?? 0, y: farmTile[1] ?? 0 },
    });
    expect(ack).toMatchObject({ ok: true });

    const seen = await ben.waitFor(
      (p) =>
        p.cities
          .find((c) => c.id === anaCity)
          ?.buildings.some((b) => b.kind === "farm") ?? false,
    );
    expect(seen.version).toBe((ack as { version: number }).version);
    expect(JSON.stringify(seen.cities)).not.toContain('"coins"');
    expect(seen.myCity?.id).toBe(joined[1]?.cityId);
    await teacher.waitFor(
      (p) => p.allCities?.find((c) => c.id === anaCity)?.coins === 40,
    );
  });

  it("runs a trade and a market order between two students", async () => {
    const h = await start();
    const { teacher, students, joined } = await classroom(h);
    await teacher.act({ type: "start" });
    const [ana, ben] = students as [Client, Client];
    await ben.waitFor((p) => p.phase === "running");

    const proposed = await ana.act({
      type: "proposeTrade",
      payload: {
        to: joined[1]?.cityId ?? "green",
        give: { wood: 5 },
        get: { coins: 8 },
      },
    });
    expect(proposed).toMatchObject({ ok: true });
    const offer = (
      await ben.waitFor((p) => p.offers.some((o) => o.status === "open"))
    ).offers[0];
    expect(
      await ben.act({
        type: "acceptTrade",
        payload: { offerId: offer?.id ?? "" },
      }),
    ).toMatchObject({ ok: true });
    await ana.waitFor(
      (p) => p.myCity?.goods.wood === 15 && p.myCity.tradesCompleted === 1,
    );

    const before = ana.state.market.copper.buy;
    for (let i = 0; i < 3; i++) {
      await ben.act({
        type: "marketBuy",
        payload: { good: "copper", amount: 1 },
      });
    }
    await ana.waitFor((p) => p.market.copper.stock === 97);
    expect(ana.state.market.copper.buy).toBeGreaterThanOrEqual(before);
  });

  it("holds a Town Meeting and everyone sees the result", async () => {
    const h = await start();
    const { teacher, students } = await classroom(h);
    await teacher.act({ type: "start" });
    await teacher.act({
      type: "startMeeting",
      payload: { policyIds: ["river-protection"] },
    });
    await Promise.all(
      students.map((s) => s.waitFor((p) => p.phase === "meeting")),
    );

    for (const [i, student] of students.entries()) {
      const ack = await student.act({
        type: "vote",
        payload: { policyId: "river-protection", yes: i < 3 },
      });
      expect(ack).toMatchObject({ ok: true });
    }
    await teacher.waitFor((p) => p.meeting?.votedCities.length === 5);
    expect((students[0] as Client).state.meeting?.votes).toBeUndefined();

    await teacher.act({ type: "closeMeeting" });
    await Promise.all(
      students.map((s) =>
        s.waitFor(
          (p) => p.policies.includes("river-protection") && p.season === 2,
        ),
      ),
    );
    expect(
      (students[4] as Client).state.meetingResults[0]?.tally[
        "river-protection"
      ],
    ).toEqual({ yes: 3, no: 2 });
  });

  it("rejects bad actions with a reason and logs them for research", async () => {
    const h = await start();
    const { code, teacherToken, teacher, students } = await classroom(h);
    const ana = students[0] as Client;

    expect(
      await ana.act({ type: "build", payload: { kind: "farm", x: 0, y: 0 } }),
    ).toMatchObject({
      ok: false,
      code: "WRONG_PHASE",
    });
    expect(await ana.act({ type: "start" })).toMatchObject({
      ok: false,
      code: "NOT_ALLOWED",
    });
    await teacher.act({ type: "start" });
    expect(
      await ana.act({ type: "build", payload: { kind: "farm", x: 0, y: 0 } }),
    ).toMatchObject({
      ok: false,
      code: "NOT_YOUR_LAND",
    });

    const projector = await connect(h, { code, role: "projector" });
    expect(projector.state.myCity).toBeNull();
    expect(projector.state.offers).toEqual([]);
    expect(await projector.act({ type: "start" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });

    await expect(connect(h, { code, token: "nope" })).rejects.toThrow(
      "BAD_TOKEN",
    );
    await expect(connect(h, { code: "ZZZZZ", token: "nope" })).rejects.toThrow(
      "NO_GAME",
    );

    const log = await fetch(`${h.baseUrl}/api/sandbox/games/${code}/log`, {
      headers: { authorization: `Bearer ${teacherToken}` },
    });
    const rows = (await log.json()) as LoggedEvent[];
    expect(
      rows.filter((r) => r.outcome === "rejected").map((r) => r.errorCode),
    ).toEqual(
      expect.arrayContaining(["WRONG_PHASE", "NOT_ALLOWED", "NOT_YOUR_LAND"]),
    );
    expect(rows.every((r) => !("name" in r.payload))).toBe(true);
    expect(
      (await fetch(`${h.baseUrl}/api/sandbox/games/${code}/log`)).status,
    ).toBe(404);
  });

  it("validates joins", async () => {
    const h = await start();
    const { code } = (await post<CreateGameResponse>(h, "/games", {})).body;
    expect((await post(h, `/games/${code}/join`, { name: "Ana" })).status).toBe(
      201,
    );
    expect((await post(h, `/games/${code}/join`, { name: "ana" })).status).toBe(
      409,
    );
    expect((await post(h, `/games/${code}/join`, { name: "x" })).status).toBe(
      400,
    );
    expect((await post(h, `/games/NOPE1/join`, { name: "Ben" })).status).toBe(
      404,
    );
    expect((await post(h, "/games", { cityCount: 9 })).status).toBe(400);
    expect(
      (await fetch(`${h.baseUrl}/api/sandbox/games/${code.toLowerCase()}`))
        .status,
    ).toBe(200);
  });

  it("treats a retried action as a duplicate instead of doing it twice", async () => {
    const h = await start();
    const { teacher, students } = await classroom(h, ["Ana", "Ben"]);
    await teacher.act({ type: "start" });
    const ana = students[0] as Client;
    await ana.waitFor((p) => p.phase === "running");
    const intent: ClientIntent = {
      type: "marketSell",
      payload: { good: "wood", amount: 1 },
    };

    const first = await ana.act(intent, "same-id");
    const retry = await ana.act(intent, "same-id");
    expect(first).toMatchObject({ ok: true });
    expect(retry).toMatchObject({
      ok: true,
      duplicate: true,
      version: (first as { version: number }).version,
    });
    await ana.waitFor((p) => p.myCity?.goods.wood === 19);
  });

  it("picks up where it left off after a reconnect", async () => {
    const h = await start();
    const { code, teacher, students, joined } = await classroom(h, [
      "Ana",
      "Ben",
    ]);
    await teacher.act({ type: "start" });
    const ana = students[0] as Client;
    await ana.waitFor((p) => p.phase === "running");
    await ana.act({ type: "marketSell", payload: { good: "wood", amount: 2 } });
    ana.socket.disconnect();

    await teacher.act({ type: "pause" });
    const again = await connect(h, { code, token: joined[0]?.token ?? "" });
    expect(again.state.phase).toBe("paused");
    expect(again.state.myCity?.goods.wood).toBe(18);
    expect(again.state.me?.name).toBe("Ana");
  });

  it("lets the teacher move and remove students", async () => {
    const h = await start();
    const { teacher, students, joined } = await classroom(h, ["Ana", "Ben"]);
    const ana = students[0] as Client;
    const target = joined[1]?.cityId ?? "green";

    expect(
      await teacher.admin({
        type: "movePlayer",
        playerId: joined[0]?.playerId ?? "",
        cityId: target,
      }),
    ).toMatchObject({ ok: true });
    await ana.waitFor((p) => p.myCity?.id === target);
    expect(
      await ana.admin({
        type: "removePlayer",
        playerId: joined[1]?.playerId ?? "",
      }),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });

    const ben = students[1] as Client;
    const gone = new Promise((resolve) =>
      ben.socket.once("disconnect", resolve),
    );
    await teacher.admin({
      type: "removePlayer",
      playerId: joined[1]?.playerId ?? "",
    });
    await gone;
    await teacher.waitFor((p) =>
      p.cities.every((c) => !c.players.includes("Ben")),
    );
  });

  it("ticks on its own while running, and stops when paused", async () => {
    const h = await start(20);
    const { teacher, students } = await classroom(h, ["Ana"]);
    const ana = students[0] as Client;
    await teacher.act({ type: "start" });
    await ana.waitFor((p) => p.tick >= 3);

    await teacher.act({ type: "pause" });
    const paused = (await ana.waitFor((p) => p.phase === "paused")).tick;
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(ana.state.tick).toBe(paused);

    await teacher.act({ type: "setSpeed", payload: { speed: 4 } });
    await teacher.act({ type: "resume" });
    await ana.waitFor((p) => p.tick >= paused + 8, 1500);
  });
});
