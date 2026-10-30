// Event catalog tests: npm test
// No database except for the seed check, which uses an in-memory PGlite like db.test.ts.

import { test, describe, expect } from "vitest";
import { eventPayloads, eventTypes } from "./catalog";
import { parseEvent } from "./log";
import { events } from "./drizzle-schema";
import { createTestDb } from "./helpers";
import { seed } from "./seed";

const participant = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

// A valid participant event; pass overrides for the field under test
const event = (overrides: Record<string, unknown> = {}) => ({
  type: "auction.bid_changed",
  ts: new Date(),
  game_id: 1,
  round: 1,
  phase: "bids",
  team_id: 1,
  participant_id: participant,
  teacher_id: null,
  actor_type: "participant",
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
      "trade.notification_read",
      "production.building_ran",
      "round.city_stats",
      "round.snapshot",
      "phase.advanced",
      "round.ended",
      "game.started",
      "game.ended",
    ]) {
      expect(type in eventPayloads, `missing ${type}`).toBeTruthy();
    }
    expect(eventTypes.some((t) => t.startsWith("teacher."))).toBeTruthy();
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
      phase: null,
      payload: {
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
