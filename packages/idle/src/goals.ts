import { GOALS, type GoalId } from "./content.ts";
import type { CityState, GameEvent } from "./types.ts";

function reached(city: CityState): Record<GoalId, boolean> {
  return {
    "first-farm": city.buildings.some((b) => b.kind === "farm"),
    "ten-people": city.population >= 10,
    "twenty-people": city.population >= 20,
    "first-park": city.buildings.some((b) => b.kind === "park"),
    "level-three": city.buildings.some((b) => b.level >= 3),
    "first-trade": city.tradesCompleted > 0,
    "happy-city": city.happiness >= 80,
    // Six buildings besides the Town Hall.
    "clean-city": city.buildings.length >= 7 && city.pollution < 5,
  };
}

// Marks newly reached goals. Returns the city and one event per new goal.
export function checkGoals(city: CityState): {
  city: CityState;
  events: GameEvent[];
} {
  const done = reached(city);
  const fresh = (Object.keys(GOALS) as GoalId[]).filter(
    (goal) => done[goal] && !city.goals.includes(goal),
  );
  if (!fresh.length) return { city, events: [] };
  return {
    city: { ...city, goals: [...city.goals, ...fresh] },
    events: fresh.map((goal) => ({
      type: "goal.achieved",
      city: city.id,
      payload: { goal },
    })),
  };
}
