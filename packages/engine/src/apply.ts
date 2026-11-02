import type { CityState, GameEvent, GameState } from "./types.ts";

// The only code that changes a GameState. Events are facts the engine already
// decided, so this never validates a rule; it only fails on a log that does not
// belong to this game or names a city that does not exist (a corrupt log).
export function applyEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "game.started": {
      // The log must belong to this game: same scenario, same seed.
      const { scenario, seed } = event.payload;
      if (scenario !== state.scenarioId || seed !== state.seed) {
        throw new Error(
          `game.started is for scenario "${scenario}" seed ${seed}, state is "${state.scenarioId}" seed ${state.seed}`,
        );
      }
      return state;
    }
    case "round.ended":
      // A marker in the log: the phase change that follows carries the state.
      return state;
    case "phase.advanced":
      return {
        ...state,
        phase: event.payload.to,
        round: event.payload.round,
        phaseStartedAt: event.payload.at,
      };
    case "game.paused":
      return { ...state, paused: true };
    case "game.resumed":
      return { ...state, paused: false };
    case "game.ended":
      return {
        ...state,
        phase: "ended",
        paused: false,
        endReason: event.payload.reason,
        phaseStartedAt: event.payload.at,
      };
    case "trade.gift_sent": {
      const { fromTeam, toTeam, resource, amount } = event.payload;
      const from = cityOf(state, fromTeam);
      const to = cityOf(state, toTeam);
      return {
        ...state,
        cities: {
          ...state.cities,
          [fromTeam]: withResource(from, resource, -amount),
          [toTeam]: withResource(to, resource, amount),
        },
      };
    }
    default:
      return unknownEvent(event);
  }
}

// Stops compiling if a new event type has no case above.
function unknownEvent(event: never): never {
  throw new Error(`cannot apply unknown event ${JSON.stringify(event)}`);
}

function cityOf(state: GameState, id: string): CityState {
  const city = state.cities[id];
  if (city === undefined) throw new Error(`event names unknown city "${id}"`);
  return city;
}

function withResource(
  city: CityState,
  resource: string,
  delta: number,
): CityState {
  return {
    ...city,
    resources: {
      ...city.resources,
      [resource]: (city.resources[resource] ?? 0) + delta,
    },
  };
}
