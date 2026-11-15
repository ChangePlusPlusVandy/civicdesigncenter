// Scenarios the server can run, by `games.scenario_id` (REQ-050). Bundled
// into the server build, so the runtime image needs no scenario files.

import { ScenarioSchema, type Scenario } from "@cs/shared";
import lc2Default from "../../../../scenarios/lc2-default.json";

const scenarios = new Map<string, Scenario>(
  [ScenarioSchema.parse(lc2Default)].map((s) => [s.id, s]),
);

export const DEFAULT_SCENARIO_ID = "lc2-default";

export function getScenario(id: string): Scenario | undefined {
  return scenarios.get(id);
}
