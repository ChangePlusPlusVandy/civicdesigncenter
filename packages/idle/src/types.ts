import type {
  BuildableKind,
  BuildingKind,
  Bundle,
  EventKind,
  GoalId,
  Good,
  PolicyId,
  Speed,
} from "./content.ts";
import type { CityId, CommonsId } from "./map.ts";

export type Phase = "lobby" | "running" | "paused" | "meeting" | "ended";

// Why a building did or didn't run on the last tick. Homes, parks and the
// hall have no workers and are always "ok".
export type BuildingStatus = "ok" | "stopped" | "no-workers" | "commons-empty";

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  level: number;
  running: boolean;
  status: BuildingStatus;
  // What it made on the last tick, for "+1 🌾" popups.
  lastOutput: Partial<Record<Good, number>>;
}

export interface SeasonSnapshot {
  population: number;
  coins: number;
  happiness: number;
  pollution: number;
}

export interface SeasonReport {
  season: number;
  before: SeasonSnapshot;
  after: SeasonSnapshot;
  commons: Record<CommonsId, { before: number; after: number }>;
}

export interface HistoryPoint {
  tick: number;
  population: number;
  happiness: number;
  pollution: number;
}

export interface Reflection {
  id: string;
  season: number;
  cityId: CityId;
  // Pseudonymous; the server maps it to a name for the teacher only.
  participantId: string | null;
  text: string;
  tick: number;
}

export interface CityState {
  id: CityId;
  coins: number;
  goods: Record<Good, number>;
  population: number;
  // -1..1; at 1 a person moves in, at -1 one leaves.
  growth: number;
  happiness: number;
  pollution: number;
  buildings: Building[];
  goals: GoalId[];
  tradesCompleted: number;
  seasonStart: SeasonSnapshot;
  lastReport: SeasonReport | null;
  history: HistoryPoint[];
}

export interface CommonsState {
  stocks: Record<string, number>;
  pollution: number;
  collapsed: boolean;
}

export interface TradeOffer {
  id: string;
  from: CityId;
  to: CityId;
  give: Bundle;
  get: Bundle;
  createdTick: number;
  status: "open" | "accepted" | "declined" | "cancelled" | "expired";
}

export interface Meeting {
  policyIds: PolicyId[];
  // votes[city][policy] = yes?
  votes: Partial<Record<CityId, Partial<Record<PolicyId, boolean>>>>;
}

export interface MeetingResult {
  season: number;
  passed: PolicyId[];
  failed: PolicyId[];
  tally: Partial<Record<PolicyId, { yes: number; no: number }>>;
}

export interface ActiveEvent {
  kind: EventKind;
  untilTick: number;
}

export interface IdleState {
  tick: number;
  season: number;
  phase: Phase;
  speed: Speed;
  cityIds: CityId[];
  cities: Partial<Record<CityId, CityState>>;
  commons: Record<CommonsId, CommonsState>;
  market: Record<Good, number>;
  offers: TradeOffer[];
  nextId: number;
  meeting: Meeting | null;
  meetingResults: MeetingResult[];
  policies: PolicyId[];
  events: ActiveEvent[];
  // River and woods health (0-100) when the season began, for the report.
  seasonStartHealth: Record<CommonsId, number>;
  regionHistory: { tick: number; health: number }[];
  reflections: Reflection[];
}

export type PlayerIntent =
  | { type: "build"; payload: { kind: BuildableKind; x: number; y: number } }
  | { type: "upgrade"; payload: { buildingId: string } }
  | { type: "demolish"; payload: { buildingId: string } }
  | { type: "toggle"; payload: { buildingId: string } }
  | { type: "marketBuy"; payload: { good: Good; amount: number } }
  | { type: "marketSell"; payload: { good: Good; amount: number } }
  | { type: "proposeTrade"; payload: { to: CityId; give: Bundle; get: Bundle } }
  | { type: "acceptTrade"; payload: { offerId: string } }
  | { type: "declineTrade"; payload: { offerId: string } }
  | { type: "cancelTrade"; payload: { offerId: string } }
  | { type: "vote"; payload: { policyId: PolicyId; yes: boolean } }
  | { type: "reflect"; payload: { season: number; text: string } };

export type TeacherIntent =
  | { type: "start"; payload?: undefined }
  | { type: "pause"; payload?: undefined }
  | { type: "resume"; payload?: undefined }
  | { type: "setSpeed"; payload: { speed: Speed } }
  | { type: "startMeeting"; payload: { policyIds: PolicyId[] } }
  | { type: "closeMeeting"; payload?: undefined }
  | { type: "triggerEvent"; payload: { kind: EventKind } }
  | { type: "end"; payload?: undefined };

export type Intent =
  PlayerIntent | TeacherIntent | { type: "tick"; payload?: undefined };

export type Actor =
  | { kind: "player"; cityId: CityId; participantId?: string }
  | { kind: "teacher" }
  | { kind: "system" };

export type ErrorCode =
  | "UNKNOWN_ACTION"
  | "NOT_ALLOWED"
  | "WRONG_PHASE"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "NOT_YOUR_LAND"
  | "OCCUPIED"
  | "NEEDS_NEIGHBOR"
  | "CANT_AFFORD"
  | "MAX_LEVEL"
  | "STORAGE_FULL"
  | "SOLD_OUT"
  | "TOO_MANY_OFFERS";

export interface RuleError {
  code: ErrorCode;
  message: string;
}

export interface GameEvent {
  type: string;
  city?: CityId;
  payload: Record<string, unknown>;
}

export type ReduceResult =
  | { ok: true; state: IdleState; events: GameEvent[] }
  | { ok: false; error: RuleError };
