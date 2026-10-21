import type { ActionIntent, StatId } from "@cs/shared";
import type { RngState } from "./rng.ts";

// Who sent an action. The server derives it from the auth token; clients never
// send it. `cityId` is the scenario city the player's team plays.
export type Actor =
  | { kind: "player"; playerId: string; cityId: string }
  | { kind: "teacher"; teacherId: string };

// An intent the server has validated, plus who sent it and when (ms since the
// epoch, from the server clock). The engine reads time only from here.
export type Action = ActionIntent & { actor: Actor; at: number };

export type CityState = {
  resources: Record<string, number>;
  stats: Record<StatId, number>;
};

export type FeatureState = {
  stocks: Record<string, number>;
};

// Everything that changes during a game. Static data (buildings, the map)
// stays in the Scenario. Plain JSON only: it is stored as a snapshot.
export type GameState = {
  scenarioId: string;
  year: number;
  seed: number;
  rng: RngState;
  cities: Record<string, CityState>;
  features: Record<string, FeatureState>;
};

export type GameEvent = {
  type: "resourceGifted";
  payload: { from: string; to: string; resource: string; amount: number };
};

export type RuleErrorCode =
  | "UNKNOWN_ACTION"
  | "WRONG_SCENARIO"
  | "NOT_ALLOWED"
  | "UNKNOWN_CITY"
  | "UNKNOWN_RESOURCE"
  | "INVALID_AMOUNT"
  | "NOT_ENOUGH_RESOURCES";

export type RuleError = { code: RuleErrorCode; message: string };

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: RuleError };
