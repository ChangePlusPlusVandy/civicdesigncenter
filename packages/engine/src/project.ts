import type { Audience, StatId } from "@cs/shared";
import type { CityState, FeatureState, GameState } from "./types.ts";

// project(state, audience) is the only producer of client-bound state
// (ARCH-023). Every projection except the teacher's is built field by field
// from an allow-list, so state added later (sealed bids, ARCH-024) stays
// out of the other audiences' projections until a projection names it.
// Each projection is a fresh copy and never shares objects with `state`.

export type TeacherProjection = { audience: "teacher" } & GameState;

export type ProjectorProjection = {
  audience: "projector";
  scenarioId: string;
  round: number;
  // Every city's public stats (ARCHITECTURE §5); no resources.
  cities: Record<string, { stats: Record<StatId, number> }>;
  features: Record<string, FeatureState>;
};

export type TeamProjection = {
  audience: "team";
  scenarioId: string;
  round: number;
  // Null while the seat has no team (lobby).
  cityId: string | null;
  city: CityState | null;
  // No feature stocks yet: a team sees only what is in its view
  // (RULE-032), which arrives with map visibility (#20).
};

// Reserved for the per-student trade-only view; the same data as `team`
// for now (ARCHITECTURE §5).
export type PlayerProjection = Omit<TeamProjection, "audience"> & {
  audience: "player";
};

export type Projection =
  TeacherProjection | ProjectorProjection | TeamProjection | PlayerProjection;

type ProjectionFor<A extends Audience> = Extract<
  Projection,
  { audience: A["kind"] }
>;

// GameState is plain JSON (types.ts), so a JSON round trip copies it.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function project<A extends Audience>(
  state: GameState,
  audience: A,
): ProjectionFor<A>;
export function project(state: GameState, audience: Audience): Projection {
  switch (audience.kind) {
    case "teacher":
      // Full state, including every sealed bid (ARCH-024).
      return { audience: "teacher", ...copy(state) };
    case "projector":
      return {
        audience: "projector",
        scenarioId: state.scenarioId,
        round: state.round,
        cities: Object.fromEntries(
          Object.entries(state.cities).map(([id, city]) => [
            id,
            { stats: copy(city.stats) },
          ]),
        ),
        features: copy(state.features),
      };
    case "team":
    case "player": {
      const { cityId } = audience;
      const city = cityId === null ? undefined : state.cities[cityId];
      return {
        audience: audience.kind,
        scenarioId: state.scenarioId,
        round: state.round,
        cityId,
        city: city ? copy(city) : null,
      };
    }
  }
}
