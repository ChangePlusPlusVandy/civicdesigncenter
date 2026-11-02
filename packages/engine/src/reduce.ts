import type { Scenario } from "@cs/shared";
import { applyEvent } from "./apply.ts";
import { resourcesExhausted } from "./end.ts";
import { authorize } from "./permissions.ts";
import type {
  Action,
  Decision,
  GameEvent,
  GameState,
  Phase,
  ReduceResult,
  RuleErrorCode,
} from "./types.ts";

// Applies one action. Returns the next state and the events it produced, or a
// RuleError and no change. Never mutates `state`.
//
// An action is checked against who sent it and the phase (permissions.ts),
// turned into events (decide), and the new state is those events folded in with
// applyEvent. Replaying the events from the seed therefore gives the same state.
export function reduce(
  scenario: Scenario,
  state: GameState,
  action: Action,
): ReduceResult {
  if (state.scenarioId !== scenario.id) {
    return fail(
      "WRONG_SCENARIO",
      `state is for "${state.scenarioId}", scenario is "${scenario.id}"`,
    );
  }
  const denied = authorize(state, action);
  if (denied) return { ok: false, error: denied };

  const decision = decide(scenario, state, action);
  if (!decision.ok) return decision;
  return {
    ok: true,
    state: decision.events.reduce(applyEvent, state),
    events: decision.events,
  };
}

function decide(
  scenario: Scenario,
  state: GameState,
  action: Action,
): Decision {
  switch (action.type) {
    case "startGame":
      return startGame(state, action);
    case "advancePhase":
      return advancePhase(scenario, state, action);
    case "pauseGame":
      return ok([{ type: "game.paused", payload: { at: action.at } }]);
    case "resumeGame":
      return ok([{ type: "game.resumed", payload: { at: action.at } }]);
    case "endGame":
      return ok([
        {
          type: "game.ended",
          payload: { reason: "teacher", at: action.at },
        },
      ]);
    case "giftResource":
      return giftResource(scenario, state, action);
    default:
      return unknownAction(action);
  }
}

// Reached only when an action type has no case above, and it stops compiling if
// one is added without a case. (authorize already rejects unknown types.)
function unknownAction(action: never): Decision {
  const type = (action as { type?: unknown }).type;
  return fail("UNKNOWN_ACTION", `unknown action type "${String(type)}"`);
}

function startGame(
  state: GameState,
  action: Extract<Action, { type: "startGame" }>,
): Decision {
  return ok([
    {
      type: "game.started",
      payload: { scenario: state.scenarioId, seed: state.seed, at: action.at },
    },
    advanced(state, "auction", state.round, action.at),
  ]);
}

// The round runs auction, build, resolve, then the next round's auction. The
// auction (#22) and production (#23) rules run on the first two steps and add
// their events here; leaving resolve ends the round.
const NEXT_PHASE: Partial<Record<Phase, Phase>> = {
  auction: "build",
  build: "resolve",
};

function advancePhase(
  scenario: Scenario,
  state: GameState,
  action: Extract<Action, { type: "advancePhase" }>,
): Decision {
  const next = NEXT_PHASE[state.phase];
  if (next !== undefined) {
    return ok([advanced(state, next, state.round, action.at)]);
  }

  // Leaving resolve: the round is over.
  const roundEnded: GameEvent = {
    type: "round.ended",
    payload: { round: state.round },
  };
  if (resourcesExhausted(scenario, state)) {
    return ok([
      roundEnded,
      {
        type: "game.ended",
        payload: { reason: "resources_exhausted", at: action.at },
      },
    ]);
  }
  return ok([
    roundEnded,
    advanced(state, "auction", state.round + 1, action.at),
  ]);
}

function advanced(
  state: GameState,
  to: Phase,
  round: number,
  at: number,
): GameEvent {
  return {
    type: "phase.advanced",
    payload: { from: state.phase, to, round, at },
  };
}

// One-way gift from the player's city to another city, as in LC2: the receiver
// accepts nothing and there is no fee. Allowed in the auction and build phases.
function giftResource(
  scenario: Scenario,
  state: GameState,
  action: Extract<Action, { type: "giftResource" }>,
): Decision {
  const { actor } = action;
  if (actor.kind !== "player") {
    return fail("NOT_ALLOWED", "only players can gift resources");
  }

  const { to, resource, amount } = action.payload;
  const from = actor.cityId;
  const giver = state.cities[from];
  const receiver = state.cities[to];
  if (giver === undefined) {
    return fail("UNKNOWN_CITY", `unknown city "${from}"`);
  }
  if (receiver === undefined) {
    return fail("UNKNOWN_CITY", `unknown city "${to}"`);
  }
  if (from === to) return fail("NOT_ALLOWED", "a city cannot gift to itself");
  if (!scenario.resources.some((r) => r.id === resource)) {
    return fail("UNKNOWN_RESOURCE", `unknown resource "${resource}"`);
  }
  if (!Number.isInteger(amount) || amount < 1) {
    return fail("INVALID_AMOUNT", "amount must be a positive whole number");
  }
  const held = giver.resources[resource] ?? 0;
  if (held < amount) {
    return fail(
      "NOT_ENOUGH_RESOURCES",
      `${from} has ${held} ${resource}, needs ${amount}`,
    );
  }

  return ok([
    {
      type: "trade.gift_sent",
      payload: {
        fromTeam: from,
        toTeam: to,
        resource,
        amount,
        fromBefore: held,
        toBefore: receiver.resources[resource] ?? 0,
      },
    },
  ]);
}

function ok(events: GameEvent[]): Decision {
  return { ok: true, events };
}

function fail(
  code: RuleErrorCode,
  message: string,
): { ok: false; error: { code: RuleErrorCode; message: string } } {
  return { ok: false, error: { code, message } };
}
