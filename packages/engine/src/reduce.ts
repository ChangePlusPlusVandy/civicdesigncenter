import type { Scenario } from "@cs/shared";
import type {
  Action,
  GameState,
  ReduceResult,
  RuleErrorCode,
} from "./types.ts";

// Applies one action. Returns the next state and the events it produced, or a
// RuleError and no change. Never mutates `state`.
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
  switch (action.type) {
    case "giftResource":
      return giftResource(scenario, state, action);
    default:
      return unknownAction(action.type);
  }
}

// Reached only when an action that skipped validation slips through, and it
// stops compiling if a new action type has no case above.
function unknownAction(type: never): ReduceResult {
  return fail("UNKNOWN_ACTION", `unknown action type "${String(type)}"`);
}

// One-way gift from the player's city to another city, in any phase, as in
// LC2. Phase rules arrive with the phase state machine (#21).
function giftResource(
  scenario: Scenario,
  state: GameState,
  action: Extract<Action, { type: "giftResource" }>,
): ReduceResult {
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

  return {
    ok: true,
    state: {
      ...state,
      cities: {
        ...state.cities,
        [from]: {
          ...giver,
          resources: { ...giver.resources, [resource]: held - amount },
        },
        [to]: {
          ...receiver,
          resources: {
            ...receiver.resources,
            [resource]: (receiver.resources[resource] ?? 0) + amount,
          },
        },
      },
    },
    events: [
      { type: "resourceGifted", payload: { from, to, resource, amount } },
    ],
  };
}

function fail(code: RuleErrorCode, message: string): ReduceResult {
  return { ok: false, error: { code, message } };
}
