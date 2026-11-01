import { describe, expect, it } from "vitest";
import { RULES } from "./permissions.ts";
import { reduce } from "./reduce.ts";
import {
  AT,
  errorCode,
  gift,
  inPhase,
  lifecycle,
  lobby,
  playing,
  red,
  run,
  scenario,
  teacher,
} from "./test-helpers.ts";
import type { GameState, Phase } from "./types.ts";

describe("a new game", () => {
  it("waits in the lobby", () => {
    const state = lobby();
    expect(state.phase).toBe("lobby");
    expect(state.round).toBe(1);
    expect(state.paused).toBe(false);
    expect(state.endReason).toBeNull();
    expect(state.phaseStartedAt).toBeNull();
  });
});

describe("startGame", () => {
  it("opens round 1 with the auction and records when", () => {
    const { state, events } = run(lobby(), lifecycle("startGame", AT));
    expect(state.phase).toBe("auction");
    expect(state.round).toBe(1);
    expect(state.phaseStartedAt).toBe(AT);
    expect(events).toEqual([
      {
        type: "game.started",
        payload: { scenario: "lc2-default", seed: 42, at: AT },
      },
      {
        type: "phase.advanced",
        payload: { from: "lobby", to: "auction", round: 1, at: AT },
      },
    ]);
  });

  it("cannot run twice", () => {
    expect(errorCode(playing(), lifecycle("startGame"))).toBe("WRONG_PHASE");
  });
});

describe("advancePhase", () => {
  it("steps auction, build, resolve and into the next round", () => {
    let state = playing();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      state = run(state, lifecycle("advancePhase", AT + 1000 * (i + 1))).state;
      seen.push(`${state.round}:${state.phase}`);
    }
    expect(seen).toEqual(["1:build", "1:resolve", "2:auction", "2:build"]);
    expect(state.phaseStartedAt).toBe(AT + 4000);
  });

  it("ends the round when it leaves resolve", () => {
    const { events } = run(
      inPhase("resolve"),
      lifecycle("advancePhase", AT + 5),
    );
    expect(events).toEqual([
      { type: "round.ended", payload: { round: 1 } },
      {
        type: "phase.advanced",
        payload: { from: "resolve", to: "auction", round: 2, at: AT + 5 },
      },
    ]);
  });

  it("is not available in the lobby", () => {
    expect(errorCode(lobby(), lifecycle("advancePhase"))).toBe("WRONG_PHASE");
  });
});

describe("pause and resume", () => {
  it("keeps the phase and blocks play until resumed", () => {
    const paused = run(inPhase("build"), lifecycle("pauseGame")).state;
    expect(paused.paused).toBe(true);
    expect(paused.phase).toBe("build");
    expect(errorCode(paused, gift("green", "clay", 1))).toBe("GAME_PAUSED");
    expect(errorCode(paused, lifecycle("advancePhase"))).toBe("GAME_PAUSED");
    expect(errorCode(paused, lifecycle("pauseGame"))).toBe("GAME_PAUSED");

    const resumed = run(paused, lifecycle("resumeGame")).state;
    expect(resumed.paused).toBe(false);
    expect(errorCode(resumed, gift("green", "clay", 1))).toBeUndefined();
  });

  it("cannot resume a game that is running", () => {
    expect(errorCode(playing(), lifecycle("resumeGame"))).toBe("NOT_PAUSED");
  });

  it("cannot pause in the lobby", () => {
    expect(errorCode(lobby(), lifecycle("pauseGame"))).toBe("WRONG_PHASE");
  });
});

describe("endGame", () => {
  it("lets the teacher end a running, paused or lobby game", () => {
    for (const state of [
      lobby(),
      playing(),
      run(playing(), lifecycle("pauseGame")).state,
    ]) {
      const { state: ended, events } = run(state, lifecycle("endGame", AT + 9));
      expect(ended.phase).toBe("ended");
      expect(ended.endReason).toBe("teacher");
      expect(ended.paused).toBe(false);
      expect(ended.phaseStartedAt).toBe(AT + 9);
      expect(events).toEqual([
        { type: "game.ended", payload: { reason: "teacher", at: AT + 9 } },
      ]);
    }
  });

  it("rejects every action once the game has ended", () => {
    const ended = run(playing(), lifecycle("endGame")).state;
    for (const type of Object.keys(RULES)) {
      const action =
        type === "giftResource"
          ? gift("green", "clay", 1)
          : lifecycle(type as Parameters<typeof lifecycle>[0]);
      expect(errorCode(ended, action)).toBe("GAME_ENDED");
    }
  });
});

describe("resources running out", () => {
  // Every harvestable stock gone; pollution left alone.
  const emptied = (state: GameState): GameState => ({
    ...state,
    features: Object.fromEntries(
      Object.entries(state.features).map(([id, f]) => [
        id,
        {
          stocks: Object.fromEntries(
            Object.entries(f.stocks).map(([k, v]) => [
              k,
              k === "pollution" ? v : 0,
            ]),
          ),
        },
      ]),
    ),
  });

  it("ends the game at the end of the round", () => {
    const state = emptied(inPhase("resolve"));
    const { state: next, events } = run(
      state,
      lifecycle("advancePhase", AT + 7),
    );
    expect(next.phase).toBe("ended");
    expect(next.endReason).toBe("resources_exhausted");
    expect(next.round).toBe(1);
    expect(events).toEqual([
      { type: "round.ended", payload: { round: 1 } },
      {
        type: "game.ended",
        payload: { reason: "resources_exhausted", at: AT + 7 },
      },
    ]);
  });

  it("does not end while any harvestable stock is left", () => {
    const state = emptied(inPhase("resolve"));
    const one = {
      ...state,
      features: {
        ...state.features,
        lake: { stocks: { fish: 1, pollution: 0 } },
      },
    };
    expect(run(one, lifecycle("advancePhase")).state.phase).toBe("auction");
  });

  it("does not count pollution as a resource", () => {
    const state = emptied(inPhase("resolve"));
    const polluted = {
      ...state,
      features: {
        ...state.features,
        lake: { stocks: { fish: 0, pollution: 99 } },
      },
    };
    expect(run(polluted, lifecycle("advancePhase")).state.endReason).toBe(
      "resources_exhausted",
    );
  });

  it("does not end the fresh scenario", () => {
    expect(run(inPhase("resolve"), lifecycle("advancePhase")).state.phase).toBe(
      "auction",
    );
  });
});

// Every action, in every phase, paused or not, against the rules table.
describe("who may do what", () => {
  const phases: Phase[] = ["lobby", "auction", "build", "resolve", "ended"];
  const actions = {
    startGame: lifecycle("startGame"),
    advancePhase: lifecycle("advancePhase"),
    pauseGame: lifecycle("pauseGame"),
    resumeGame: lifecycle("resumeGame"),
    endGame: lifecycle("endGame"),
    giftResource: gift("green", "clay", 1),
  } as const;

  function expected(
    type: keyof typeof actions,
    phase: Phase,
    paused: boolean,
  ): string | undefined {
    if (phase === "ended") return "GAME_ENDED";
    const rule = RULES[type];
    if (rule.paused === "never" && paused) return "GAME_PAUSED";
    if (rule.paused === "only" && !paused) return "NOT_PAUSED";
    if (!rule.phases.includes(phase)) return "WRONG_PHASE";
    return undefined;
  }

  for (const type of Object.keys(actions) as (keyof typeof actions)[]) {
    it(`${type}`, () => {
      for (const phase of phases) {
        for (const paused of [false, true]) {
          const state: GameState = { ...playing(), phase, paused };
          expect(
            errorCode(state, actions[type]),
            `${phase} paused=${paused}`,
          ).toBe(expected(type, phase, paused));
        }
      }
    });
  }

  it("lets players gift only in the auction and build phases", () => {
    const allowed = phases.filter(
      (phase) =>
        errorCode({ ...playing(), phase }, gift("green", "clay", 1)) ===
        undefined,
    );
    expect(allowed).toEqual(["auction", "build"]);
  });

  it("keeps lifecycle actions to the teacher", () => {
    const asPlayer = (type: Parameters<typeof lifecycle>[0]) =>
      errorCode(playing(), lifecycle(type, AT, red));
    expect(asPlayer("advancePhase")).toBe("NOT_ALLOWED");
    expect(asPlayer("pauseGame")).toBe("NOT_ALLOWED");
    expect(asPlayer("endGame")).toBe("NOT_ALLOWED");
    expect(asPlayer("startGame")).toBe("NOT_ALLOWED");
  });

  it("keeps gifts to players", () => {
    expect(errorCode(playing(), gift("green", "clay", 1, teacher))).toBe(
      "NOT_ALLOWED",
    );
  });

  it("changes nothing on a rejection", () => {
    const state = lobby();
    const result = reduce(scenario, state, gift("green", "clay", 1));
    expect(result.ok).toBe(false);
    expect(state).toEqual(lobby());
  });
});
