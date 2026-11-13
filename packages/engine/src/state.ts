import type { Scenario } from "@cs/shared";
import { seedRng } from "./rng.ts";
import type { CityState, FeatureState, GameState } from "./types.ts";

// The state a game starts in. Every city gets the scenario's starting
// resources (missing ones at 0) and stats.
export function createInitialState(
  scenario: Scenario,
  seed: number,
): GameState {
  const resources = Object.fromEntries(
    scenario.resources.map((r) => [r.id, scenario.start.resources[r.id] ?? 0]),
  );

  const cities: Record<string, CityState> = {};
  for (const city of scenario.cities) {
    cities[city.id] = {
      resources: { ...resources },
      stats: { ...scenario.start.stats },
    };
  }

  const features: Record<string, FeatureState> = {};
  for (const feature of scenario.features) {
    features[feature.id] = { stocks: { ...feature.stocks } };
  }

  const rng = seedRng(seed);
  return {
    scenarioId: scenario.id,
    round: scenario.start.round,
    seed: rng,
    rng,
    cities,
    features,
  };
}
