import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createGame, reduce, type IdleState, type RosterEntry } from "@cs/idle";
import { createApp } from "../app.ts";
import { exportCsv } from "./export.ts";
import { Sandbox } from "./index.ts";

function playedGame(): IdleState {
  let state = createGame(2, "nashville");
  const step = (
    actor: Parameters<typeof reduce>[1],
    intent: Parameters<typeof reduce>[2],
  ) => {
    const result = reduce(state, actor, intent);
    if (!result.ok) throw new Error(result.error.message);
    state = result.state;
  };
  step({ kind: "teacher" }, { type: "start" });
  for (let i = 0; i < 6; i++) step({ kind: "system" }, { type: "tick" });
  step(
    { kind: "player", cityId: "red", participantId: "p1" },
    {
      type: "reflect",
      payload: { season: 1, text: '=HYPERLINK("x") said "share", ok' },
    },
  );
  return state;
}

const roster: RosterEntry[] = [
  {
    playerId: "p1",
    name: "Ana",
    cityId: "red",
    contribution: {
      builds: 2,
      upgrades: 0,
      trades: 1,
      market: 0,
      votes: 1,
      reflections: 1,
    },
  },
];

describe("exportCsv", () => {
  it("lists each student's activity by name and city", () => {
    const csv = exportCsv("activity", playedGame(), roster, []);
    expect(csv.split("\r\n")[0]).toBe(
      "student,city,builds,upgrades,trades,market_deals,votes,reflections",
    );
    expect(csv).toContain("Ana,Germantown,2,0,1,0,1,1");
  });

  it("escapes quotes and commas and defuses spreadsheet formulas", () => {
    const csv = exportCsv("reflections", playedGame(), roster, []);
    expect(csv).toContain(
      `1,Germantown,Ana,6,"'=HYPERLINK(""x"") said ""share"", ok"`,
    );
  });

  it("keeps the research log pseudonymous", () => {
    const csv = exportCsv("events", playedGame(), roster, [
      {
        seq: 1,
        tick: 0,
        at: 0,
        actor: "player",
        participantId: "p1",
        city: "red",
        type: "building.built",
        outcome: "accepted",
        payload: {},
      },
    ]);
    expect(csv).toContain("p1,Germantown,building.built,accepted");
    expect(csv).not.toContain("Ana");
  });

  it("includes city trend samples", () => {
    const csv = exportCsv("cities", playedGame(), roster, []);
    expect(csv).toContain("sample,Germantown,,5,");
  });
});

describe("export routes", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const step of cleanup.splice(0)) await step();
  });

  it("only lets the game's teacher download, as a named attachment", async () => {
    const sandbox = new Sandbox({ tickMs: 0 });
    const server = createServer(createApp({ sandbox }));
    sandbox.attach(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    cleanup.push(
      () => sandbox.close(),
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const base = `http://localhost:${(server.address() as AddressInfo).port}/api/sandbox`;

    const created = (await (
      await fetch(`${base}/games`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).json()) as { code: string; teacherToken: string };
    const auth = { authorization: `Bearer ${created.teacherToken}` };

    expect(
      (await fetch(`${base}/games/${created.code}/export/activity.csv`)).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${base}/games/${created.code}/export/secrets.csv`, {
          headers: auth,
        })
      ).status,
    ).toBe(404);

    const csv = await fetch(
      `${base}/games/${created.code}/export/activity.csv`,
      { headers: auth },
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain(
      `citysettlers-${created.code}-activity.csv`,
    );

    const json = await fetch(`${base}/games/${created.code}/export/all.json`, {
      headers: auth,
    });
    const body = (await json.json()) as { code: string; state: IdleState };
    expect(body.code).toBe(created.code);
    expect(body.state.mapId).toBe("classic");
  });
});
