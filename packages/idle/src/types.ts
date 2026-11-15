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
import type { CityId, CommonsId, MapId } from "./map.ts";

// Where the game is: waiting to start, running, paused, in a Town Meeting, or
// over.
export type Phase = "lobby" | "running" | "paused" | "meeting" | "ended";

// Why a building did or didn't run on the last tick. Homes, parks and the
// hall have no workers and are always "ok".
export type BuildingStatus = "ok" | "stopped" | "no-workers" | "commons-empty";

// A building on a city's land.
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

// A city's headline numbers at one moment.
export interface SeasonSnapshot {
  population: number;
  coins: number;
  happiness: number;
  pollution: number;
}

// How a city and the commons changed over a season, shown to students
// afterwards.
export interface SeasonReport {
  season: number;
  before: SeasonSnapshot;
  after: SeasonSnapshot;
  commons: Record<CommonsId, { before: number; after: number }>;
}

// One sample of a city's trends, for the charts.
export interface HistoryPoint {
  tick: number;
  population: number;
  happiness: number;
  pollution: number;
}

// A student's written answer to the season's question.
export interface Reflection {
  id: string;
  season: number;
  cityId: CityId;
  // Pseudonymous; the server maps it to a name for the teacher only.
  participantId: string | null;
  text: string;
  tick: number;
}

// Everything about one city, including what only its own students may see.
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

// The river or a woods: its stocks, its pollution, and whether it has
// collapsed.
export interface CommonsState {
  stocks: Record<string, number>;
  pollution: number;
  collapsed: boolean;
}

// A proposed swap between two cities. It happens all at once or not at all.
export interface TradeOffer {
  id: string;
  from: CityId;
  to: CityId;
  give: Bundle;
  get: Bundle;
  createdTick: number;
  status: "open" | "accepted" | "declined" | "cancelled" | "expired";
}

// A Town Meeting in progress: the policies on the table and each city's votes.
export interface Meeting {
  policyIds: PolicyId[];
  // votes[city][policy] = yes?
  votes: Partial<Record<CityId, Partial<Record<PolicyId, boolean>>>>;
}

// Which policies passed or failed at one meeting, with the tally.
export interface MeetingResult {
  season: number;
  passed: PolicyId[];
  failed: PolicyId[];
  tally: Partial<Record<PolicyId, { yes: number; no: number }>>;
}

// A teacher-triggered event and the tick it ends on.
export interface ActiveEvent {
  kind: EventKind;
  untilTick: number;
}

// The whole game. Plain data, so it can be saved, sent and replayed. Only
// reduce() makes a new one (ARCH-010).
export interface IdleState {
  mapId: MapId;
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

// What a student can ask to do for their own city.
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

// What the teacher can ask to do for the whole game.
export type TeacherIntent =
  | { type: "start"; payload?: undefined }
  | { type: "pause"; payload?: undefined }
  | { type: "resume"; payload?: undefined }
  | { type: "setSpeed"; payload: { speed: Speed } }
  | { type: "startMeeting"; payload: { policyIds: PolicyId[] } }
  | { type: "closeMeeting"; payload?: undefined }
  | { type: "triggerEvent"; payload: { kind: EventKind } }
  | { type: "end"; payload?: undefined };

// Every intent, including the server's tick.
export type Intent =
  PlayerIntent | TeacherIntent | { type: "tick"; payload?: undefined };

// Who sent an intent. The engine checks each intent against it.
export type Actor =
  | { kind: "player"; cityId: CityId; participantId?: string }
  | { kind: "teacher" }
  | { kind: "system" };

// Why the engine refused an intent. Logged with every rejected attempt
// (EVT-003).
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

// A refused intent: its code, and a message to show the student.
export interface RuleError {
  code: ErrorCode;
  message: string;
}

// Something that happened, as the engine reports it. The server adds the
// sequence number, time and actor before logging it (EVT-001). Payloads never
// hold names (EVT-008).
export interface GameEvent {
  type: string;
  city?: CityId;
  payload: Record<string, unknown>;
}

// What reduce() returns: the next state and its events, or the error and no
// change.
export type ReduceResult =
  | { ok: true; state: IdleState; events: GameEvent[] }
  | { ok: false; error: RuleError };
