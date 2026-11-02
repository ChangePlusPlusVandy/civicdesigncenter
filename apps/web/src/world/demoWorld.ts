import {
  createGame,
  project,
  reduce,
  type BuildableKind,
  type CityId,
  type CityState,
  type IdleState,
  type Intent,
  type Projection,
} from "@cs/idle";

type Plan = [BuildableKind, number, number, level?: number][];

// A lived-in mid-game world for the join page, made by playing the real
// rules: scripted builds, a few upgrades, then 40 ticks.
const PLANS: Record<CityId, Plan> = {
  red: [
    ["farm", 3, 3, 2],
    ["lumber-camp", 1, 3],
    ["clay-pit", 3, 4],
    ["house", 2, 1],
    ["park", 4, 1],
  ],
  green: [
    ["fishing-dock", 9, 0, 2],
    ["lumber-camp", 12, 2],
    ["farm", 10, 3],
    ["house", 11, 1],
    ["house", 11, 2],
  ],
  pink: [
    ["hunting-lodge", 13, 6],
    ["copper-mine", 14, 9],
    ["house", 14, 7, 2],
    ["farm", 12, 8],
  ],
  blue: [
    ["copper-mine", 15, 12, 2],
    ["fishing-dock", 12, 13],
    ["farm", 12, 14],
    ["house", 13, 14],
    ["park", 15, 15],
  ],
  yellow: [
    ["fishing-dock", 5, 12],
    ["lumber-camp", 2, 14],
    ["farm", 5, 13],
    ["house", 4, 13, 3],
  ],
};

function step(
  state: IdleState,
  cityId: CityId | null,
  intent: Intent,
): IdleState {
  const actor = cityId
    ? { kind: "player" as const, cityId }
    : { kind: "teacher" as const };
  const result = reduce(
    state,
    intent.type === "tick" ? { kind: "system" } : actor,
    intent,
  );
  return result.ok ? result.state : state;
}

export function buildDemoWorld(): Pick<
  Projection,
  "cities" | "commons" | "tick"
> {
  let state = step(createGame(5), null, { type: "start" });
  for (const id of state.cityIds) {
    const city = state.cities[id] as CityState;
    state = {
      ...state,
      cities: {
        ...state.cities,
        [id]: {
          ...city,
          coins: 999,
          population: 9,
          goods: { food: 99, wood: 99, clay: 99, copper: 99 },
        },
      },
    };
    for (const [kind, x, y, level = 1] of PLANS[id]) {
      state = step(state, id, { type: "build", payload: { kind, x, y } });
      const built = (state.cities[id] as CityState).buildings.at(-1);
      for (let l = 1; l < level && built; l++) {
        state = step(state, id, {
          type: "upgrade",
          payload: { buildingId: built.id },
        });
      }
    }
  }
  for (let t = 0; t < 40; t++) state = step(state, null, { type: "tick" });
  const { cities, commons, tick } = project(
    state,
    { kind: "projector" },
    1,
    [],
  );
  return { cities, commons, tick };
}
