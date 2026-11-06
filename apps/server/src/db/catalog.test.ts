// Event catalog tests: npm test
// No database except for the seed check, which uses an in-memory PGlite like db.test.ts.

import { test, describe, expect } from "vitest";
import { eventPayloads, eventTypes, phases } from "@cs/shared/catalog";
import { parseEvent } from "./log";
import { events, phaseEnum } from "./drizzle-schema";
import { createTestDb } from "./helpers";
import { seed } from "./seed";

const participant = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

// A valid player event; pass overrides for the field under test
const event = (overrides: Record<string, unknown> = {}) => ({
  type: "auction.bid_changed",
  ts: new Date(),
  game_id: 1,
  round: 1,
  phase: "auction",
  team_id: 1,
  participant_id: participant,
  teacher_id: null,
  actor_type: "player",
  outcome: "applied",
  error_code: null,
  client_action_id: "a1",
  payload: {
    lot: "lot-1",
    resource: "cash",
    before: 100,
    after: 150,
    delta: 50,
    requested: 150,
  },
  ...overrides,
});

const system = {
  actor_type: "system",
  participant_id: null,
  client_action_id: null,
};

describe("catalog", () => {
  test("covers every type in the spec", () => {
    for (const type of [
      "auction.bid_changed",
      "auction.ready_set",
      "auction.lot_added",
      "auction.lot_won",
      "auction.lot_unsold",
      "building.placed",
      "building.removed",
      "building.toggled",
      "trade.gift_sent",
      "production.building_ran",
      "round.city_stats",
      "round.snapshot",
      "phase.advanced",
      "round.ended",
      "game.started",
      "game.paused",
      "game.resumed",
      "game.ended",
    ]) {
      expect(type in eventPayloads, `missing ${type}`).toBeTruthy();
    }
    expect(eventTypes.some((t) => t.startsWith("teacher."))).toBeTruthy();
  });

  test("notification reads are not logged (EVT-002)", () => {
    expect("trade.notification_read" in eventPayloads).toBe(false);
  });

  test("the database phase enum uses the catalog's phases", () => {
    expect(phaseEnum.enumValues).toEqual([...phases]);
  });

  test("a valid event parses", () => {
    expect(parseEvent(event()).type).toBe("auction.bid_changed");
  });

  test("unknown types are rejected", () => {
    expect(() => parseEvent(event({ type: "bid_placed" }))).toThrow();
  });

  test("payload is checked against its type", () => {
    expect(() => parseEvent(event({ payload: { lot: "lot-1" } }))).toThrow();
  });

  test("bid delta must equal after - before", () => {
    expect(() =>
      parseEvent(
        event({
          payload: {
            lot: "lot-1",
            resource: "cash",
            before: 100,
            after: 150,
            delta: -50,
            requested: 150,
          },
        }),
      ),
    ).toThrow();
  });
});

describe("payloads match docs/EVENTS.md", () => {
  const parse = (type: keyof typeof eventPayloads, payload: unknown) =>
    eventPayloads[type].parse(payload);

  test("game.started takes a scenario id string, a uint32 seed and at", () => {
    const valid = { scenario: "lc2-default", seed: 42, at: 1000 };
    expect(parse("game.started", valid)).toEqual(valid);
    expect(() => parse("game.started", { ...valid, scenario: 1 })).toThrow();
    expect(() => parse("game.started", { ...valid, seed: -1 })).toThrow();
    expect(() =>
      parse("game.started", { scenario: "lc2-default", seed: 42 }),
    ).toThrow();
  });

  test("game.ended only accepts the spec's reasons", () => {
    expect(parse("game.ended", { reason: "teacher", at: 1 })).toBeTruthy();
    expect(
      parse("game.ended", { reason: "resources_exhausted", at: 1 }),
    ).toBeTruthy();
    expect(() => parse("game.ended", { reason: "other", at: 1 })).toThrow();
  });

  test("game.paused and game.resumed need at", () => {
    expect(parse("game.paused", { at: 1 })).toEqual({ at: 1 });
    expect(parse("game.resumed", { at: 1 })).toEqual({ at: 1 });
    expect(() => parse("game.paused", {})).toThrow();
    expect(() => parse("game.resumed", {})).toThrow();
  });

  test("phase.advanced needs real phases, round and at", () => {
    const valid = { from: "lobby", to: "auction", round: 1, at: 1 };
    expect(parse("phase.advanced", valid)).toEqual(valid);
    expect(() => parse("phase.advanced", { ...valid, from: null })).toThrow();
    expect(() => parse("phase.advanced", { ...valid, round: 0 })).toThrow();
    expect(() =>
      parse("phase.advanced", { from: "lobby", to: "auction" }),
    ).toThrow();
  });

  test("trade.gift_sent uses city ids and drops the trade id", () => {
    const valid = {
      fromTeam: "red",
      toTeam: "blue",
      resource: "cash",
      amount: 5,
      fromBefore: 10,
      toBefore: 0,
    };
    expect(parse("trade.gift_sent", { ...valid, trade: "t1" })).toEqual(valid);
    expect(() => parse("trade.gift_sent", { ...valid, fromTeam: 1 })).toThrow();
  });

  test("auction.lot_won and lot_unsold name teams by city id", () => {
    const won = {
      lot: "lot-1",
      team: "red",
      resource: "cash",
      amount: 5,
      resourcesBefore: { cash: 10 },
      resourcesAfter: { cash: 5 },
    };
    expect(parse("auction.lot_won", won)).toEqual(won);
    expect(() => parse("auction.lot_won", { ...won, team: 1 })).toThrow();
    const unsold = { lot: "lot-1", tiedTeams: ["red", "blue"], reason: "tie" };
    expect(parse("auction.lot_unsold", unsold)).toEqual(unsold);
    expect(() =>
      parse("auction.lot_unsold", { ...unsold, tiedTeams: [1, 2] }),
    ).toThrow();
  });

  test("auction.lot_added carries the RNG state", () => {
    const lot = { lot: "lot-1", buildingType: "farm", resource: "cash" };
    expect(parse("auction.lot_added", { ...lot, rng: 7 })).toBeTruthy();
    expect(() => parse("auction.lot_added", lot)).toThrow();
  });

  test("round.city_stats needs a team and pollution", () => {
    const stats = {
      resources: { cash: 1 },
      population: 1,
      happiness: 1,
      pollution: 0,
    };
    const valid = {
      team: "red",
      before: stats,
      after: stats,
      happinessFactor: 1,
      populationFactor: 1,
    };
    expect(parse("round.city_stats", valid)).toEqual(valid);
    expect(() =>
      parse("round.city_stats", { ...valid, team: undefined }),
    ).toThrow();
    const { pollution: _pollution, ...noPollution } = stats;
    expect(() =>
      parse("round.city_stats", { ...valid, after: noPollution }),
    ).toThrow();
  });
});

describe("envelope: round and phase", () => {
  test("round must be at least 1", () => {
    expect(() => parseEvent(event({ round: 0 }))).toThrow();
  });

  test("phase is required", () => {
    expect(() => parseEvent(event({ phase: null }))).toThrow();
  });
});

describe("envelope: who", () => {
  test("participant events need participant_id", () => {
    expect(() => parseEvent(event({ participant_id: null }))).toThrow();
  });

  test("system events have no participant_id", () => {
    const roundEnded = {
      type: "round.ended",
      team_id: null,
      payload: { round: 1 },
    };
    expect(parseEvent(event({ ...roundEnded, ...system }))).toBeTruthy();
    expect(() =>
      parseEvent(
        event({ ...roundEnded, ...system, participant_id: participant }),
      ),
    ).toThrow();
  });

  test("teacher events need teacher_id, not participant_id", () => {
    const lock = {
      type: "teacher.room_locked",
      team_id: null,
      payload: { before: false, after: true },
    };
    expect(
      parseEvent(
        event({
          ...lock,
          actor_type: "teacher",
          participant_id: null,
          teacher_id: "user_abc",
        }),
      ),
    ).toBeTruthy();
    expect(() =>
      parseEvent(
        event({ ...lock, actor_type: "teacher", participant_id: null }),
      ),
    ).toThrow();
  });
});

describe("envelope: rejected attempts", () => {
  const rejected = { outcome: "rejected", error_code: "INSUFFICIENT_FUNDS" };

  test("rejected needs an error_code, applied must not have one", () => {
    expect(() => parseEvent(event({ outcome: "rejected" }))).toThrow();
    expect(() => parseEvent(event({ error_code: "X" }))).toThrow();
  });

  test("rejected bid keeps before === after and records the attempt in requested", () => {
    const payload = {
      lot: "lot-1",
      resource: "cash",
      before: 100,
      after: 100,
      delta: 0,
      requested: 9999,
    };
    expect(parseEvent(event({ ...rejected, payload })).outcome).toBe(
      "rejected",
    );
  });

  test("rejected event that changed state is refused", () => {
    expect(() => parseEvent(event({ ...rejected }))).toThrow(/changed state/);
  });

  test("rejected ready_set cannot change ready", () => {
    const base = { type: "auction.ready_set", ...rejected };
    expect(
      parseEvent(event({ ...base, payload: { ready: true, before: true } })),
    ).toBeTruthy();
    expect(() =>
      parseEvent(event({ ...base, payload: { ready: true, before: false } })),
    ).toThrow(/changed state/);
  });

  test("toggle applied must agree with outcome", () => {
    const toggle = (applied: boolean, after: boolean) => ({
      type: "building.toggled",
      payload: { building: "b1", before: false, after, applied },
    });
    expect(parseEvent(event(toggle(true, true)))).toBeTruthy();
    expect(
      parseEvent(event({ ...toggle(false, false), ...rejected })),
    ).toBeTruthy();
    expect(() =>
      parseEvent(event({ ...toggle(true, false), ...rejected })),
    ).toThrow(/disagrees/);
  });
});

describe("system events with reasons", () => {
  const ran = (payload: Record<string, unknown>) =>
    event({
      ...system,
      type: "production.building_ran",
      phase: "resolve",
      payload: {
        team: "red",
        building: "b1",
        inputs: {},
        outputs: {},
        natureBefore: 10,
        natureAfter: 10,
        notes: [],
        ...payload,
      },
    });

  test("a building that ran logs inputs and outputs", () => {
    expect(
      parseEvent(
        ran({ inputs: { coal: 2 }, outputs: { power: 5 }, natureAfter: 8 }),
      ),
    ).toBeTruthy();
  });

  test("a skipped building logs why and has no inputs, outputs or nature change", () => {
    expect(parseEvent(ran({ skipReason: "toggled_off" }))).toBeTruthy();
    expect(() =>
      parseEvent(ran({ skipReason: "toggled_off", outputs: { power: 5 } })),
    ).toThrow();
  });

  test("lot_unsold needs a reason", () => {
    const unsold = (payload: Record<string, unknown>) =>
      event({ ...system, type: "auction.lot_unsold", team_id: null, payload });
    expect(
      parseEvent(unsold({ lot: "lot-1", tiedTeams: [], reason: "no_bids" })),
    ).toBeTruthy();
    expect(() => parseEvent(unsold({ lot: "lot-1", tiedTeams: [] }))).toThrow();
  });
});

describe("seed", () => {
  test("every seeded event payload matches the catalog", async () => {
    const db = await createTestDb();
    try {
      await seed(db);
      const rows = await db.select().from(events);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          row.type in eventPayloads,
          `unknown type ${row.type}`,
        ).toBeTruthy();
        eventPayloads[row.type as keyof typeof eventPayloads].parse(
          row.payload,
        );
      }
    } finally {
      await db.$client.close();
    }
  });
});
