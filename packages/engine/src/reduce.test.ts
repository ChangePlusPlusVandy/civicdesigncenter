import { describe, expect, it } from "vitest";
import { reduce } from "./reduce.ts";
import { createInitialState } from "./state.ts";
import { AT, errorCode, gift, playing, red, scenario } from "./test-helpers.ts";
import type { Action, GameState } from "./types.ts";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

describe("createInitialState", () => {
  it("starts every city with the scenario's resources and stats", () => {
    const state = createInitialState(scenario, 42);
    expect(Object.keys(state.cities)).toEqual([
      "red",
      "green",
      "pink",
      "blue",
      "yellow",
    ]);
    expect(state.cities.red).toEqual({
      resources: { lumber: 4, clay: 4, copper: 4, food: 4 },
      stats: { population: 3, happiness: 5, pollution: 0 },
    });
    expect(state.features.lake).toEqual({ stocks: { fish: 50, pollution: 0 } });
    expect(state.round).toBe(1);
    expect(state.seed).toBe(42);
    expect(state.rng).toBe(42);
  });

  it("does not share objects between cities", () => {
    const state = createInitialState(scenario, 1);
    expect(state.cities.red!.resources).not.toBe(state.cities.green!.resources);
  });

  it("round-trips through JSON unchanged", () => {
    const state = createInitialState(scenario, 42);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("reduce: giftResource", () => {
  it("moves resources and reports an event", () => {
    const state = deepFreeze(playing());
    const result = reduce(scenario, state, gift("green", "lumber", 3));
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.cities.red!.resources.lumber).toBe(1);
    expect(result.state.cities.green!.resources.lumber).toBe(7);
    expect(result.events).toEqual([
      {
        type: "trade.gift_sent",
        payload: {
          fromTeam: "red",
          toTeam: "green",
          resource: "lumber",
          amount: 3,
          fromBefore: 4,
          toBefore: 4,
        },
      },
    ]);
  });

  it("leaves the input state and untouched cities alone", () => {
    const state = deepFreeze(playing());
    const before = JSON.stringify(state);
    const result = reduce(scenario, state, gift("green", "food", 4));
    expect(JSON.stringify(state)).toBe(before);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.cities.blue).toBe(state.cities.blue);
    expect(result.state.rng).toBe(state.rng);
  });

  it("allows gifting everything a city holds", () => {
    const state = playing();
    const result = reduce(scenario, state, gift("green", "clay", 4));
    expect(result.ok && result.state.cities.red!.resources.clay).toBe(0);
  });

  it("rejects gifts larger than the stock", () => {
    const state = playing();
    expect(errorCode(state, gift("green", "clay", 5))).toBe(
      "NOT_ENOUGH_RESOURCES",
    );
  });

  it("rejects zero, negative and fractional amounts", () => {
    const state = playing();
    expect(errorCode(state, gift("green", "clay", 0))).toBe("INVALID_AMOUNT");
    expect(errorCode(state, gift("green", "clay", -1))).toBe("INVALID_AMOUNT");
    expect(errorCode(state, gift("green", "clay", 1.5))).toBe("INVALID_AMOUNT");
  });

  it("rejects unknown cities and resources", () => {
    const state = playing();
    expect(errorCode(state, gift("purple", "clay", 1))).toBe("UNKNOWN_CITY");
    expect(
      errorCode(
        state,
        gift("green", "clay", 1, {
          kind: "player",
          participantId: "p",
          cityId: "x",
        }),
      ),
    ).toBe("UNKNOWN_CITY");
    expect(errorCode(state, gift("green", "fish", 1))).toBe("UNKNOWN_RESOURCE");
    expect(errorCode(state, gift("green", "gold", 1))).toBe("UNKNOWN_RESOURCE");
  });

  it("treats inherited object keys as unknown cities, not a crash", () => {
    const state = playing();
    for (const key of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(errorCode(state, gift(key, "clay", 1))).toBe("UNKNOWN_CITY");
      expect(
        errorCode(
          state,
          gift("green", "clay", 1, {
            kind: "player",
            participantId: "p",
            cityId: key,
          }),
        ),
      ).toBe("UNKNOWN_CITY");
    }
  });

  it("rejects gifts to yourself and gifts from teachers", () => {
    const state = playing();
    expect(errorCode(state, gift("red", "clay", 1))).toBe("INVALID_TARGET");
    expect(
      errorCode(
        state,
        gift("red", "clay", 1, { kind: "teacher", teacherId: "t1" }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("reduce", () => {
  it("rejects unknown action types", () => {
    const state = playing();
    const bogus = {
      type: "launchRocket",
      payload: {},
      actor: red,
      at: AT,
    } as unknown as Action;
    expect(errorCode(state, bogus)).toBe("UNKNOWN_ACTION");
  });

  it("rejects state from another scenario", () => {
    const state = {
      ...playing(),
      scenarioId: "nashville-v1",
    };
    expect(errorCode(state, gift("green", "clay", 1))).toBe("WRONG_SCENARIO");
  });

  it("is deterministic and survives a JSON snapshot between steps", () => {
    const actions = [
      gift("green", "clay", 2),
      gift("blue", "food", 1),
      gift("pink", "clay", 2),
    ];
    const run = (snapshot: boolean) => {
      let state = playing();
      for (const action of actions) {
        const result = reduce(scenario, state, action);
        if (!result.ok) throw new Error(`rejected: ${result.error.message}`);
        state = snapshot
          ? (JSON.parse(JSON.stringify(result.state)) as GameState)
          : result.state;
      }
      return state;
    };
    const straight = run(false);
    expect(run(false)).toEqual(straight);
    expect(run(true)).toEqual(straight);
    expect(straight.cities.red!.resources.clay).toBe(0);
    expect(straight.cities.green!.resources.clay).toBe(6);
    expect(straight.cities.pink!.resources.clay).toBe(6);
    expect(straight.cities.blue!.resources.food).toBe(5);
  });
});
