import type { Scenario } from "@cs/shared";
import type { GameState } from "./types.ts";

// "Resources run out": every nature stock a city could harvest is gone. Pollution
// sitting in a lake is not a resource. LC2 had no end condition, so this is a
// working definition until the Nashville rules are frozen (#27). It needs at
// least one such stock, so a scenario without nature never ends this way.
export function resourcesExhausted(
  scenario: Scenario,
  state: GameState,
): boolean {
  const harvestable = new Set(
    [...scenario.resources, ...scenario.natureResources].map((r) => r.id),
  );
  let found = false;
  for (const feature of Object.values(state.features)) {
    for (const [resource, stock] of Object.entries(feature.stocks)) {
      if (!harvestable.has(resource)) continue;
      found = true;
      if (stock > 0) return false;
    }
  }
  return found;
}
