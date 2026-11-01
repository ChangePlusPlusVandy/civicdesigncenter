import { describe, expect, it } from "vitest";
import { applyEvent } from "./apply.ts";
import { reduce } from "./reduce.ts";
import { replay } from "./replay.ts";
import {
  AT,
  SEED,
  gift,
  lifecycle,
  lobby,
  red,
  scenario,
} from "./test-helpers.ts";
import type { Action, Actor, GameEvent, GameState } from "./types.ts";

const green: Actor = { kind: "player", participantId: "p2", cityId: "green" };

// A whole game as the server would drive it. Some actions are rejected, and a
// rejection leaves no event behind.
function script(): Action[] {
  let t = AT;
  const at = () => (t += 1000);
  return [
    gift("green", "clay", 1, red, at()), // rejected: lobby
    lifecycle("startGame", at()),
    gift("green", "clay", 2, red, at()),
    gift("red", "food", 1, green, at()),
    lifecycle("advancePhase", at()), // build
    gift("blue", "lumber", 4, red, at()),
    gift("blue", "lumber", 1, red, at()), // rejected: red has none left
    lifecycle("pauseGame", at()),
    gift("green", "clay", 1, red, at()), // rejected: paused
    lifecycle("resumeGame", at()),
    lifecycle("advancePhase", at()), // resolve
    lifecycle("advancePhase", at()), // round 2, auction
    gift("pink", "copper", 3, green, at()),
    lifecycle("advancePhase", at()), // build
    lifecycle("advancePhase", at()), // resolve
    lifecycle("advancePhase", at()), // round 3, auction
    lifecycle("endGame", at()),
    gift("green", "clay", 1, red, at()), // rejected: ended
  ];
}

// Plays the actions in order. `states[i]` is the state after the i-th accepted
// action, and `ends[i]` is how many events had been logged by then.
function play(actions: Action[]) {
  let state: GameState = lobby();
  const log: GameEvent[] = [];
  const states: GameState[] = [state];
  const ends: number[] = [0];
  let rejected = 0;
  for (const action of actions) {
    const result = reduce(scenario, state, action);
    if (!result.ok) {
      rejected++;
      continue;
    }
    state = result.state;
    log.push(...result.events);
    states.push(state);
    ends.push(log.length);
  }
  return { state, log, states, ends, rejected };
}

describe("replay", () => {
  const { state, log, states, ends, rejected } = play(script());

  it("plays the scripted game as expected", () => {
    expect(rejected).toBe(4);
    expect(state.phase).toBe("ended");
    expect(state.endReason).toBe("teacher");
    expect(state.round).toBe(3);
    expect(state.cities.red!.resources).toEqual({
      lumber: 0,
      clay: 2,
      copper: 4,
      food: 5,
    });
    expect(state.cities.green!.resources).toEqual({
      lumber: 4,
      clay: 6,
      copper: 1,
      food: 3,
    });
  });

  it("rebuilds the final state from the seed and the events", () => {
    expect(replay(scenario, SEED, log)).toEqual(state);
  });

  it("rebuilds it after the log has been stored as JSON", () => {
    const stored = JSON.parse(JSON.stringify(log)) as GameEvent[];
    expect(replay(scenario, SEED, stored)).toEqual(state);
  });

  it("matches the live state after every accepted action", () => {
    for (let i = 0; i < states.length; i++) {
      expect(replay(scenario, SEED, log.slice(0, ends[i]))).toEqual(states[i]);
    }
  });

  it("keeps the RNG state in step", () => {
    expect(replay(scenario, SEED, log).rng).toBe(state.rng);
    expect(state.rng).toBe(SEED);
  });

  it("gives the same result for the same seed and actions", () => {
    const again = play(script());
    expect(again.log).toEqual(log);
    expect(again.state).toEqual(state);
  });

  it("refuses a log from another seed or scenario", () => {
    expect(() => replay(scenario, SEED + 1, log)).toThrow(/seed 42/);
    const elsewhere = replay(scenario, SEED, []);
    const foreign = { ...elsewhere, scenarioId: "nashville-v1" };
    expect(() => log.reduce(applyEvent, foreign)).toThrow(/nashville-v1/);
  });

  it("records what each side held before every gift", () => {
    const gifts = log.flatMap((e) =>
      e.type === "trade.gift_sent" ? [e.payload] : [],
    );
    expect(gifts).toEqual([
      {
        fromTeam: "red",
        toTeam: "green",
        resource: "clay",
        amount: 2,
        fromBefore: 4,
        toBefore: 4,
      },
      {
        fromTeam: "green",
        toTeam: "red",
        resource: "food",
        amount: 1,
        fromBefore: 4,
        toBefore: 4,
      },
      {
        fromTeam: "red",
        toTeam: "blue",
        resource: "lumber",
        amount: 4,
        fromBefore: 4,
        toBefore: 4,
      },
      {
        fromTeam: "green",
        toTeam: "pink",
        resource: "copper",
        amount: 3,
        fromBefore: 4,
        toBefore: 4,
      },
    ]);
  });

  it("throws on a log that names a city that does not exist", () => {
    const bad: GameEvent[] = [
      {
        type: "trade.gift_sent",
        payload: {
          fromTeam: "ghost",
          toTeam: "red",
          resource: "clay",
          amount: 1,
          fromBefore: 0,
          toBefore: 0,
        },
      },
    ];
    expect(() => replay(scenario, SEED, bad)).toThrow(/unknown city "ghost"/);
  });
});
