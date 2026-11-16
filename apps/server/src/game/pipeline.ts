// The action pipeline (ARCHITECTURE §4): take the game's lock, validate the
// intent, de-duplicate it, check can(), run the engine, write the event(s)
// and the snapshot in one transaction, broadcast every audience's
// projection, then ack.

import { and, asc, eq, max } from "drizzle-orm";
import {
  reduce,
  type Action,
  type Actor,
  type GameEvent,
  type GameState,
} from "@cs/engine";
import {
  can,
  parseActionMessage,
  type ActionIntent,
  type ActionReply,
} from "@cs/shared";
import { events, games as gameRows, snapshots } from "../db/drizzle-schema.ts";
import { parseEvent } from "../db/log.ts";
import type { ActionHandler, Db, SocketSession } from "../realtime/index.ts";
import { errorKind } from "../realtime/index.ts";
import { ActiveGames, type LoadedGame } from "./active-games.ts";
import { getScenario } from "./scenarios.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PlayerSession = Extract<SocketSession, { kind: "player" }>;
type PlayerActor = Extract<Actor, { kind: "player" }>;
type ParsedMessage = { clientActionId: string; intent: ActionIntent };

export type PipelineOptions = {
  getDb: () => Promise<Db> | Db;
  // Realtime.broadcast; called only after the transaction commits.
  broadcast: (gameId: number, state: GameState, version: number) => void;
  // The games held in memory and their locks (ARCH-011, ARCH-053). Pass the
  // instance the server rehydrated on boot; a fresh one by default.
  games?: ActiveGames;
  // Server clock (epoch ms), the engine's only source of time (RULE-002).
  now?: () => number;
};

// How many times one action is tried when the snapshot's version moved
// under it (ARCH-013): the first try, and one retry on the reloaded state.
const MAX_ATTEMPTS = 2;

// Thrown inside a transaction when the snapshot is not at the version the
// action was computed from (ARCH-013). Throwing rolls the transaction back.
export class VersionConflict extends Error {
  override name = "VERSION_CONFLICT";
}

// Envelope fields shared by every row one action writes (EVENTS §3).
type Envelope = {
  game_id: number;
  round: number;
  phase: LoadedGame["phase"];
  team_id: number;
  participant_id: string;
  teacher_id: null;
  actor_type: "player";
  client_action_id: string;
  server_timestamp: Date;
};

export function actionPipeline(options: PipelineOptions): ActionHandler {
  const games = options.games ?? new ActiveGames(options.getDb);
  return (session, raw, ack) => {
    // ARCH-011: one action per game at a time, from validation to broadcast.
    games
      .runExclusive(session.gameId, () => handle(options, games, session, raw))
      .then(ack, (error: unknown) => {
        // ARCH-016, ARCH-019: only the error's kind is logged; a query
        // error quotes its parameters (ARCH-082).
        console.error("action failed:", errorKind(error));
        ack({ ok: false, code: "INTERNAL" } satisfies ActionReply);
      });
  };
}

async function handle(
  options: PipelineOptions,
  games: ActiveGames,
  session: SocketSession,
  raw: unknown,
): Promise<ActionReply> {
  // ARCH-019: the projector is read-only (REQ-033). Teacher actions arrive
  // with #24 and the lifecycle intents (#21). Neither has an actor the event
  // log can record, so these refusals are not logged.
  if (session.kind !== "player") return { ok: false, code: "FORBIDDEN" };

  // ARCH-081. Not logged: the catalog has no event type for a message that
  // fails validation (ARCHITECTURE §4, open question).
  const message = parseActionMessage(raw);
  if (!message) return { ok: false, code: "INVALID" };

  const db = await options.getDb();
  // ARCH-012: a retry returns the original result and changes nothing.
  const original = await loggedResult(db, session, message.clientActionId);
  if (original) return original;

  // ARCH-019: a seat without a team has no city to act for (ARCH-027), and
  // no city for a rejected event's payload, so this refusal is not logged.
  const { teamId, cityId } = session;
  if (teamId === null || cityId === null) {
    return { ok: false, code: "FORBIDDEN" };
  }
  // teams.city_key (ARCH-017)
  const actor: PlayerActor = {
    kind: "player",
    participantId: session.participantId,
    cityId,
  };

  for (let attempt = 1; ; attempt++) {
    // ARCH-053: the in-memory state, loaded from the snapshot on a miss.
    const game = await games.get(session.gameId);
    if (!game) throw new Error("NO_SNAPSHOT");
    try {
      return await apply(options, games, game, session, teamId, actor, message);
    } catch (error) {
      if (!(error instanceof VersionConflict)) throw error;
      // ARCH-013: the snapshot moved under the in-memory copy and nothing
      // was written. Reload it and run the action on the newer state.
      games.evict(session.gameId);
      if (attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}

// Runs one validated intent against `game` and writes its result.
async function apply(
  { getDb, broadcast, now = Date.now }: PipelineOptions,
  games: ActiveGames,
  game: LoadedGame,
  session: PlayerSession,
  teamId: number,
  actor: PlayerActor,
  message: ParsedMessage,
): Promise<ActionReply> {
  const scenario = getScenario(game.scenarioId);
  if (!scenario) throw new Error("UNKNOWN_SCENARIO");
  // TODO(#21): refuse actions in a game whose phase is `ended` here, once the
  //   phase state machine sets it. Phase and turn rules stay in the engine
  //   (ARCH-084).

  const envelope: Envelope = {
    game_id: game.gameId,
    round: game.state.round,
    phase: game.phase,
    // EVT-005, EVT-011: the acting team's row id; payloads keep city ids.
    team_id: teamId,
    participant_id: session.participantId,
    teacher_id: null,
    actor_type: "player",
    client_action_id: message.clientActionId,
    server_timestamp: new Date(),
  };
  const db = await getDb();

  // ARCH-015: the role check runs before the engine.
  const result = can(session.role, message.intent.type)
    ? reduce(scenario, game.state, {
        ...message.intent,
        actor,
        at: now(),
      } satisfies Action)
    : ({ ok: false, error: { code: "FORBIDDEN" } } as const);

  if (!result.ok) {
    // ARCH-014, EVT-003: one rejected row in its own transaction; the state
    // and the version stay as they are.
    const attempt = rejectedAttempt(message.intent, actor, game.state);
    await db.transaction(async (tx) => {
      await expectVersion(tx, game.gameId, game.version);
      await insertEvents(tx, game.version, [
        {
          ...envelope,
          ...attempt,
          outcome: "rejected",
          error_code: result.error.code,
        },
      ]);
    });
    return { ok: false, code: result.error.code };
  }

  const version = game.version + 1;
  await db.transaction(async (tx) => {
    // ARCH-013: conditional on the version the action was computed from.
    // It runs first, so its row lock also orders the seq read below.
    const updated = await tx
      .update(snapshots)
      .set({ state: result.state, version, updated_at: new Date() })
      .where(
        and(
          eq(snapshots.game_id, game.gameId),
          eq(snapshots.version, game.version),
        ),
      )
      .returning({ version: snapshots.version });
    if (updated.length === 0) throw new VersionConflict();
    await insertEvents(
      tx,
      version,
      result.events.map((event) => ({
        ...envelope,
        ...event,
        outcome: "applied",
        error_code: null,
      })),
    );
    // ARCH-055: games.phase and games.paused mirror the snapshot, in the same
    // transaction.
    await tx
      .update(gameRows)
      .set({ phase: result.state.phase, paused: result.state.paused })
      .where(eq(gameRows.game_id, game.gameId));
  });
  games.set({
    ...game,
    state: result.state,
    phase: result.state.phase,
    version,
  });

  // ARCH-019, ARCH-021: only after the commit. The action is saved, so a
  // failed broadcast is logged and the ack still reports success; clients
  // get the state on their next (re)connect.
  try {
    broadcast(game.gameId, result.state, version);
  } catch (error) {
    console.error("broadcast failed:", errorKind(error));
  }
  return { ok: true, version };
}

// ARCH-012: the ack an earlier action with this clientActionId got, rebuilt
// from the events it wrote; null when the id is new. Refusals that are not
// logged (ARCH-019, ARCH-081) leave nothing to find, so a retry of one is
// checked again and refused again; it changed nothing either way.
async function loggedResult(
  db: Db,
  session: PlayerSession,
  clientActionId: string,
): Promise<ActionReply | null> {
  const [row] = await db
    .select({
      outcome: events.outcome,
      errorCode: events.error_code,
      version: events.version,
    })
    .from(events)
    .where(
      and(
        eq(events.game_id, session.gameId),
        eq(events.participant_id, session.participantId),
        eq(events.client_action_id, clientActionId),
      ),
    )
    .orderBy(asc(events.seq))
    .limit(1);
  if (!row) return null;
  return row.outcome === "applied"
    ? { ok: true, version: row.version }
    : { ok: false, code: row.errorCode ?? "INTERNAL" };
}

// ARCH-013 for a rejected attempt: its event records the version it was
// checked against, so that version must still be current. Locks the
// snapshot row until the transaction ends.
async function expectVersion(tx: Tx, gameId: number, expected: number) {
  const [row] = await tx
    .select({ version: snapshots.version })
    .from(snapshots)
    .where(eq(snapshots.game_id, gameId))
    .for("update");
  if (row?.version !== expected) throw new VersionConflict();
}

// Validates each row against the catalog (EVT-010, EVT-028) and inserts it
// with the next gapless per-game `seq` (EVENTS §3).
async function insertEvents(
  tx: Tx,
  version: number,
  rows: (Envelope & {
    type: string;
    payload: unknown;
    outcome: "applied" | "rejected";
    error_code: string | null;
  })[],
) {
  if (rows.length === 0) return;
  const gameId = rows[0]!.game_id;
  const [last] = await tx
    .select({ seq: max(events.seq) })
    .from(events)
    .where(eq(events.game_id, gameId));
  const first = (last?.seq ?? 0) + 1;
  await tx.insert(events).values(
    rows.map((row, i) => ({
      ...parseEvent(row),
      seq: first + i,
      version,
    })),
  );
}

// The event a rejected intent is logged as (EVT-003), with the values in
// effect when it was attempted (EVT-021, EVT-023).
function rejectedAttempt(
  intent: ActionIntent,
  actor: PlayerActor,
  state: GameState,
): GameEvent {
  switch (intent.type) {
    case "giftResource": {
      const { to, resource, amount } = intent.payload;
      // hasOwn: ids such as "constructor" are inherited keys (reduce.ts).
      const held = (cityId: string) => {
        if (!Object.hasOwn(state.cities, cityId)) return 0;
        const resources = state.cities[cityId]!.resources;
        return Object.hasOwn(resources, resource) ? resources[resource]! : 0;
      };
      return {
        type: "trade.gift_sent",
        payload: {
          fromTeam: actor.cityId,
          toTeam: to,
          resource,
          amount,
          fromBefore: held(actor.cityId),
          toBefore: held(to),
        },
      };
    }
    default:
      // Only players reach this function, and only gifts are theirs.
      throw new Error(`no rejected-attempt event for "${intent.type}"`);
  }
}
