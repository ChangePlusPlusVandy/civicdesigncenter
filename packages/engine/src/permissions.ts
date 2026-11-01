import type { ActionType } from "@cs/shared";
import type { Action, Actor, GameState, Phase, RuleError } from "./types.ts";

type Rule = {
  actor: Actor["kind"];
  phases: readonly Phase[];
  // Whether the action may, must or must not happen while the game is paused.
  paused: "never" | "only" | "either";
};

const RUNNING: readonly Phase[] = ["auction", "build", "resolve"];

// Who may do what, and when. This is the engine's view (actor kind, phase,
// paused); the server checks a player's seat/trader role before the engine.
// Typed over every action type, so adding one without a rule does not compile.
export const RULES: Record<ActionType, Rule> = {
  startGame: { actor: "teacher", phases: ["lobby"], paused: "never" },
  advancePhase: { actor: "teacher", phases: RUNNING, paused: "never" },
  pauseGame: { actor: "teacher", phases: RUNNING, paused: "never" },
  resumeGame: { actor: "teacher", phases: RUNNING, paused: "only" },
  endGame: {
    actor: "teacher",
    phases: ["lobby", ...RUNNING],
    paused: "either",
  },
  giftResource: {
    actor: "player",
    phases: ["auction", "build"],
    paused: "never",
  },
};

// null when the action is allowed now, otherwise why not. The checks run from
// the most final reason to the least: an ended game rejects everything.
export function authorize(state: GameState, action: Action): RuleError | null {
  if (!Object.hasOwn(RULES, action.type)) {
    return {
      code: "UNKNOWN_ACTION",
      message: `unknown action type "${String(action.type)}"`,
    };
  }
  const rule = RULES[action.type];
  if (state.phase === "ended") {
    return { code: "GAME_ENDED", message: "the game has ended" };
  }
  if (action.actor.kind !== rule.actor) {
    return {
      code: "NOT_ALLOWED",
      message: `${action.type} is for ${rule.actor}s`,
    };
  }
  if (state.paused && rule.paused === "never") {
    return { code: "GAME_PAUSED", message: "the game is paused" };
  }
  if (!state.paused && rule.paused === "only") {
    return { code: "NOT_PAUSED", message: "the game is not paused" };
  }
  if (!rule.phases.includes(state.phase)) {
    return {
      code: "WRONG_PHASE",
      message: `${action.type} is not allowed in the ${state.phase} phase`,
    };
  }
  return null;
}
