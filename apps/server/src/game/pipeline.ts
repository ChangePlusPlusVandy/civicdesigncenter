// The action pipeline (ARCHITECTURE §4): validate the intent, run the
// engine, write the event(s) and the snapshot in one transaction, broadcast
// every audience's projection, then ack. Walking skeleton (#19): the
// hardening steps are marked TODO(#25).

import { eq, max } from "drizzle-orm";
import {
  reduce,
  type Action,
  type Actor,
  type GameEvent,
  type GameState,
} from "@cs/engine";
import {
  parseActionMessage,
  type ActionIntent,
  type ActionReply,
} from "@cs/shared";
import { events, games, snapshots } from "../db/drizzle-schema.ts";
import { parseEvent } from "../db/log.ts";
import type { ActionHandler, Db, SocketSession } from "../realtime/index.ts";
import { errorKind } from "../realtime/index.ts";
import { getScenario } from "./scenarios.ts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type PipelineOptions = {
  getDb: () => Promise<Db> | Db;
  // Realtime.broadcast; called only after the transaction commits.
  broadcast: (gameId: number, state: GameState, version: number) => void;
  // Server clock (epoch ms), the engine's only source of time (RULE-002).
  now?: () => number;
};

// Envelope fields shared by every row one action writes (EVENTS §3).
type Envelope = {
  game_id: number;
  round: number;
  phase: (typeof games.$inferSelect)["phase"];
  team_id: number;
  participant_id: string;
  teacher_id: null;
  actor_type: "player";
  client_action_id: string;
  server_timestamp: Date;
};

export function actionPipeline(options: PipelineOptions): ActionHandler {
  return (session, raw, ack) => {
    handle(options, session, raw).then(ack, (error: unknown) => {
      // Only the error's kind: a query error quotes its parameters (ARCH-082).
      console.error("action failed:", errorKind(error));
      ack({ ok: false, code: "INTERNAL" } satisfies ActionReply);
    });
  };
}

async function handle(
  { getDb, broadcast, now = Date.now }: PipelineOptions,
  session: SocketSession,
  raw: unknown,
): Promise<ActionReply> {
  // TODO(#25): take the per-game mutex here and hold it until the ack
  //   (ARCH-011).

  // ARCH-019: the projector is read-only (REQ-033). Teacher actions arrive
  // with #24 and the lifecycle intents (#21). Neither has an actor the event
  // log can record, so these refusals are not logged.
  if (session.kind !== "player") return { ok: false, code: "FORBIDDEN" };

  const message = parseActionMessage(raw); // ARCH-081
  // TODO(#25): log the rejected attempt (ARCH-014) once the catalog has an
  //   event type for a message that fails validation.
  if (!message) return { ok: false, code: "INVALID" };

  // TODO(#25): return the original result for a seen clientActionId
  //   (ARCH-012).
  // TODO(#25): check can(session.role, intent.type) (ARCH-015).

  // A seat without a team has no city to act for (ARCH-027).
  if (session.teamId === null || session.cityId === null) {
    return { ok: false, code: "FORBIDDEN" };
  }
  const actor: Actor = {
    kind: "player",
    participantId: session.participantId,
    cityId: session.cityId, // teams.city_key (ARCH-017)
  };

  const db = await getDb();
  // TODO(#25): keep each loaded game in memory and rehydrate on boot
  //   (ARCH-053) instead of reading the snapshot on every action.
  const [game] = await db
    .select({
      scenarioId: games.scenario_id,
      phase: games.phase,
      state: snapshots.state,
      version: snapshots.version,
    })
    .from(games)
    .innerJoin(snapshots, eq(snapshots.game_id, games.game_id))
    .where(eq(games.game_id, session.gameId))
    .limit(1);
  if (!game) throw new Error("NO_SNAPSHOT");
  const scenario = getScenario(game.scenarioId);
  if (!scenario) throw new Error("UNKNOWN_SCENARIO");

  const state = game.state as GameState;
  const action: Action = { ...message.intent, actor, at: now() };
  const result = reduce(scenario, state, action);

  const envelope: Envelope = {
    game_id: session.gameId,
    round: state.round,
    phase: game.phase,
    // EVT-005, EVT-011: the acting team's row id; payloads keep city ids.
    team_id: session.teamId,
    participant_id: session.participantId,
    teacher_id: null,
    actor_type: "player",
    client_action_id: message.clientActionId,
    server_timestamp: new Date(),
  };

  if (!result.ok) {
    // ARCH-014, EVT-003: one rejected row in its own transaction; the state
    // and the version stay as they are.
    const attempt = rejectedAttempt(message.intent, actor, state);
    await db.transaction((tx) =>
      insertEvents(tx, game.version, [
        {
          ...envelope,
          ...attempt,
          outcome: "rejected",
          error_code: result.error.code,
        },
      ]),
    );
    return { ok: false, code: result.error.code };
  }

  const version = game.version + 1;
  await db.transaction(async (tx) => {
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
    // TODO(#25): add `AND version = game.version` and abort the transaction
    //   when no row matches (ARCH-013).
    await tx
      .update(snapshots)
      .set({ state: result.state, version, updated_at: new Date() })
      .where(eq(snapshots.game_id, session.gameId));
    // ARCH-055: games.phase and games.paused are copied from the snapshot
    // here once the engine state has them (#21, PR #74).
  });

  broadcast(session.gameId, result.state, version); // ARCH-021
  return { ok: true, version };
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
  actor: Extract<Actor, { kind: "player" }>,
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
  }
}
