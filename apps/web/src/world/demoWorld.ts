import {
  createGame,
  getMap,
  placementProblem,
  project,
  reduce,
  type BuildableKind,
  type CityId,
  type CityState,
  type IdleState,
  type Intent,
  type MapId,
  type Projection,
} from "@cs/idle";

// What a busy mid-game city has built, in order. Kinds a city can't place
// (no river or woods next to it) are skipped.
const PLAN: BuildableKind[] = [
  "farm",
  "house",
  "lumber-camp",
  "fishing-dock",
  "house",
  "clay-pit",
  "park",
  "copper-mine",
  "hunting-lodge",
  "house",
];

function step(
  state: IdleState,
  cityId: CityId | null,
  intent: Intent,
): IdleState {
  const actor =
    intent.type === "tick"
      ? { kind: "system" as const }
      : cityId
        ? { kind: "player" as const, cityId }
        : { kind: "teacher" as const };
  const result = reduce(state, actor, intent);
  return result.ok ? result.state : state;
}

// A lived-in world for the join page, made by playing the real rules:
// each city builds a typical set of buildings, upgrades a few, then 40 days
// pass.
export function buildDemoWorld(
  mapId: MapId,
): Pick<Projection, "cities" | "commons" | "tick" | "mapId"> {
  const map = getMap(mapId);
  let state = step(createGame(5, mapId), null, { type: "start" });
  for (const [index, id] of state.cityIds.entries()) {
    const rich: CityState = {
      ...(state.cities[id] as CityState),
      coins: 999,
      population: 9,
      goods: { food: 99, wood: 99, clay: 99, copper: 99 },
    };
    state = { ...state, cities: { ...state.cities, [id]: rich } };
    for (const kind of PLAN.slice(0, 6 + index)) {
      const city = state.cities[id] as CityState;
      const tile = map
        .plotTiles(map.cityInfo(id))
        .find(({ x, y }) => placementProblem(map, city, kind, x, y) === null);
      if (tile)
        state = step(state, id, {
          type: "build",
          payload: { kind, x: tile.x, y: tile.y },
        });
    }
    const city = state.cities[id] as CityState;
    for (const building of city.buildings.slice(1, 3)) {
      state = step(state, id, {
        type: "upgrade",
        payload: { buildingId: building.id },
      });
    }
  }
  for (let t = 0; t < 40; t++) state = step(state, null, { type: "tick" });
  const { cities, commons, tick } = project(
    state,
    { kind: "projector" },
    1,
    [],
  );
  return { cities, commons, tick, mapId };
}
