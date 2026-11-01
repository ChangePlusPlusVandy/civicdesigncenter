import type { ActionIntent, StatId } from "@cs/shared";
import type { RngState } from "./rng.ts";

// Who sent an action. The server derives it from the auth token; clients never
// send it. `cityId` is the scenario city the player's team plays.
export type Actor =
  | { kind: "player"; participantId: string; cityId: string }
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

export type Phase = "lobby" | "auction" | "build" | "resolve" | "ended";

// Why a game ended: the teacher ended it, or nothing is left to harvest.
export type EndReason = "teacher" | "resources_exhausted";

// Everything that changes during a game. Static data (buildings, the map)
// stays in the Scenario. Plain JSON only: it is stored as a snapshot.
export type GameState = {
  scenarioId: string;
  round: number;
  phase: Phase;
  // A paused game keeps its phase; only the teacher can resume or end it.
  paused: boolean;
  endReason: EndReason | null;
  // When the current phase began (ms since the epoch, from an action's `at`).
  // Null in the lobby.
  phaseStartedAt: number | null;
  seed: number;
  rng: RngState;
  cities: Record<string, CityState>;
  features: Record<string, FeatureState>;
};

// Event types and payload keys follow docs/EVENTS.md. Where the catalog says
// "team", the value here is a scenario city id; the server maps it to a team
// row through `teams.city_key`.
//
// The log is the source of truth: applyEvent(state, event) is the only thing
// that changes a GameState, so a game can be rebuilt from its seed and events.
// An event that consumes randomness must carry the RNG state after it.
export type GameEvent =
  | {
      type: "game.started";
      payload: { scenario: string; seed: number; at: number };
    }
  | {
      type: "phase.advanced";
      payload: { from: Phase; to: Phase; round: number; at: number };
    }
  | { type: "round.ended"; payload: { round: number } }
  | { type: "game.paused"; payload: { at: number } }
  | { type: "game.resumed"; payload: { at: number } }
  | { type: "game.ended"; payload: { reason: EndReason; at: number } }
  | {
      type: "trade.gift_sent";
      payload: {
        fromTeam: string;
        toTeam: string;
        resource: string;
        amount: number;
        // What each side held of `resource` before the gift.
        fromBefore: number;
        toBefore: number;
      };
    };

export type RuleErrorCode =
  | "UNKNOWN_ACTION"
  | "WRONG_SCENARIO"
  | "NOT_ALLOWED"
  | "WRONG_PHASE"
  | "GAME_PAUSED"
  | "NOT_PAUSED"
  | "GAME_ENDED"
  | "UNKNOWN_CITY"
  | "UNKNOWN_RESOURCE"
  | "INVALID_AMOUNT"
  | "NOT_ENOUGH_RESOURCES";

export type RuleError = { code: RuleErrorCode; message: string };

// What an action decides: events to apply, or a rejection.
export type Decision =
  { ok: true; events: GameEvent[] } | { ok: false; error: RuleError };

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: RuleError };
