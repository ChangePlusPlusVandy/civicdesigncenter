// Shared by the engine tests. Not exported from the package.

import { ScenarioSchema } from "@cs/shared";
import lc2 from "../../../scenarios/lc2-default.json";
import { reduce } from "./reduce.ts";
import { createInitialState } from "./state.ts";
import type { Action, Actor, GameEvent, GameState } from "./types.ts";

export const scenario = ScenarioSchema.parse(lc2);
export const SEED = 42;
export const AT = 1_700_000_000_000;

export const teacher: Actor = { kind: "teacher", teacherId: "t1" };
export const red: Actor = {
  kind: "player",
  participantId: "p1",
  cityId: "red",
};

export function gift(
  to: string,
  resource: string,
  amount: number,
  actor: Actor = red,
  at = AT,
): Action {
  return { type: "giftResource", payload: { to, resource, amount }, actor, at };
}

type LifecycleType =
  "startGame" | "advancePhase" | "pauseGame" | "resumeGame" | "endGame";

export function lifecycle(
  type: LifecycleType,
  at = AT,
  actor: Actor = teacher,
): Action {
  return { type, payload: {}, actor, at };
}

// Applies an action that must succeed, returning the new state and its events.
export function run(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  const result = reduce(scenario, state, action);
  if (!result.ok) {
    throw new Error(
      `${action.type}: ${result.error.code} ${result.error.message}`,
    );
  }
  return { state: result.state, events: result.events };
}

export function errorCode(
  state: GameState,
  action: Action,
): string | undefined {
  const result = reduce(scenario, state, action);
  return result.ok ? undefined : result.error.code;
}

export function lobby(): GameState {
  return createInitialState(scenario, SEED);
}

// A game in round 1's auction phase.
export function playing(): GameState {
  return run(lobby(), lifecycle("startGame")).state;
}

// Steps a started game to the given phase of round 1 by advancing.
export function inPhase(phase: "auction" | "build" | "resolve"): GameState {
  let state = playing();
  while (state.phase !== phase) {
    state = run(state, lifecycle("advancePhase")).state;
  }
  return state;
}
