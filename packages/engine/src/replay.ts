import type { Scenario } from "@cs/shared";
import { applyEvent } from "./apply.ts";
import { createInitialState } from "./state.ts";
import type { GameEvent, GameState } from "./types.ts";

// Rebuilds a game from its seed and its event log. This is how the server
// rehydrates after a restart, and what the replay test holds to the live state.
export function replay(
  scenario: Scenario,
  seed: number,
  events: readonly GameEvent[],
): GameState {
  return events.reduce(applyEvent, createInitialState(scenario, seed));
}
