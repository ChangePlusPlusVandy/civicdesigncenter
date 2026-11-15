// Seed data for local development: npm run db:seed
// Run the migrations first (npm run db:migrate) so the tables exist.
// Wipes every game (cascades to teams, players, game_roles, snapshots, events) and inserts:
//   - game 1 "LOBBY1": lobby, 2 teams, 3 players (one without a team yet), no events
//   - game 2 "PLAY01": round 1 auction, 3 teams, 6 players, snapshot at version 2 with matching events:
//     the teacher's startGame (game.started + phase.advanced), an applied gift and a rejected gift
// All values are synthetic. City keys and resources are lc2-default's (scenarios/lc2-default.json); the snapshot
//   state has the engine's GameState shape (scenarioId, round, phase, paused, ..., cities, features).
// seed(db) is exported so tests can run it on an in-memory database.
// Refuses to run against a real database (DATABASE_URL set) unless SEED_ALLOW_REMOTE=1.

import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { EventPayload, EventType } from "@cs/shared/catalog";
import type * as dbModule from "./index";
import {
  games,
  teams,
  players,
  game_roles,
  snapshots,
  events,
} from "./drizzle-schema";
import { hashToken } from "./tokens";

type Db = typeof dbModule.db;

// .returning() is typed as an array; these name the rows each insert below is known to return
type Game = typeof games.$inferSelect;
type Team = typeof teams.$inferSelect;
type Player = typeof players.$inferSelect;

// A fixed action time (epoch ms), so seeded payloads are the same on every run (EVT-012)
const STARTED_AT = 1_790_000_000_000;
const TEACHER = "seed-teacher-1"; // placeholder Better Auth user id

// lc2-default starting values for one city
const startCity = () => ({
  resources: { lumber: 4, clay: 4, copper: 4, food: 4 },
  stats: { population: 3, happiness: 5, pollution: 0 },
});

// Typed so a seeded payload that drifts from the catalog fails to compile
const payload = <T extends EventType>(_type: T, p: EventPayload<T>) => p;

export async function seed(db: Db) {
  // One transaction: a failed insert rolls back the delete too, so a broken seed never leaves an empty database
  await db.transaction(async (tx) => {
    await tx.delete(games);

    //GAMES
    const [lobbyGame, activeGame] = (await tx
      .insert(games)
      .values([
        {
          scenario_id: "lc2-default",
          room_code: "LOBBY1",
          rng_seed: 12345,
          max_size: 8,
        },
        {
          scenario_id: "lc2-default",
          room_code: "PLAY01",
          rng_seed: 67890,
          max_size: 12,
          phase: "auction",
          locked: true,
          started_at: new Date(STARTED_AT),
        },
      ])
      .returning()) as [Game, Game];

    //GAME ROLES: user_id is a placeholder until the Better Auth user table exists
    await tx.insert(game_roles).values([
      { game_id: lobbyGame.game_id, user_id: TEACHER, role: "owner" },
      { game_id: activeGame.game_id, user_id: TEACHER, role: "owner" },
      {
        game_id: activeGame.game_id,
        user_id: "seed-teacher-2",
        role: "player",
      },
    ]);

    //TEAMS: city_key is the scenario city id the engine uses (EVT-011, ARCH-017)
    const [lobbyRed, lobbyGreen] = (await tx
      .insert(teams)
      .values([
        { game_id: lobbyGame.game_id, name: "Red City", city_key: "red" },
        { game_id: lobbyGame.game_id, name: "Green City", city_key: "green" },
      ])
      .returning()) as [Team, Team];

    const [red, blue, green] = (await tx
      .insert(teams)
      .values([
        { game_id: activeGame.game_id, name: "Red City", city_key: "red" },
        { game_id: activeGame.game_id, name: "Blue City", city_key: "blue" },
        { game_id: activeGame.game_id, name: "Green City", city_key: "green" },
      ])
      .returning()) as [Team, Team, Team];

    //PLAYERS
    await tx.insert(players).values([
      {
        game_id: lobbyGame.game_id,
        team_id: lobbyRed.team_id,
        username: "alice",
        token_hash: hashToken("alice-token"),
      },
      {
        game_id: lobbyGame.game_id,
        team_id: lobbyGreen.team_id,
        username: "bob",
        token_hash: hashToken("bob-token"),
      },
      {
        game_id: lobbyGame.game_id,
        team_id: null,
        username: "carol",
        token_hash: hashToken("carol-token"),
      }, // not on a team yet
    ]);

    const activePlayers = await tx
      .insert(players)
      .values([
        {
          game_id: activeGame.game_id,
          team_id: red.team_id,
          username: "dave",
          token_hash: hashToken("dave-token"),
          last_seen: new Date(),
        },
        {
          game_id: activeGame.game_id,
          team_id: red.team_id,
          username: "erin",
          token_hash: hashToken("erin-token"),
          last_seen: new Date(),
        },
        {
          game_id: activeGame.game_id,
          team_id: blue.team_id,
          username: "frank",
          token_hash: hashToken("frank-token"),
          last_seen: new Date(),
        },
        {
          game_id: activeGame.game_id,
          team_id: blue.team_id,
          username: "grace",
          token_hash: hashToken("grace-token"),
          last_seen: new Date(),
        },
        {
          game_id: activeGame.game_id,
          team_id: green.team_id,
          username: "heidi",
          token_hash: hashToken("heidi-token"),
          last_seen: new Date(),
        },
        {
          game_id: activeGame.game_id,
          team_id: green.team_id,
          username: "ivan",
          token_hash: hashToken("ivan-token"),
          kicked_at: new Date(),
        }, // kicked player
      ])
      .returning();

    const [dave, , frank] = activePlayers as [
      Player,
      Player,
      Player,
      Player,
      Player,
      Player,
    ];

    //SNAPSHOTS: one row per game, the latest state; version = number of accepted actions (ARCH-013)
    // The active game after startGame and one gift of 2 lumber from red to blue
    const activeCities = {
      red: startCity(),
      blue: startCity(),
      green: startCity(),
    };
    activeCities.red.resources.lumber = 2;
    activeCities.blue.resources.lumber = 6;
    await tx.insert(snapshots).values([
      {
        game_id: lobbyGame.game_id,
        version: 0,
        state: {
          scenarioId: "lc2-default",
          round: 1,
          phase: "lobby",
          paused: false,
          endReason: null,
          phaseStartedAt: null,
          seed: 12345,
          rng: 12345,
          cities: { red: startCity(), green: startCity() },
          features: {},
        },
      },
      {
        game_id: activeGame.game_id,
        version: 2,
        state: {
          scenarioId: "lc2-default",
          round: 1,
          phase: "auction",
          paused: false,
          endReason: null,
          phaseStartedAt: STARTED_AT,
          seed: 67890,
          rng: 67890,
          cities: activeCities,
          features: {},
        },
      },
    ]);

    //EVENTS: seq 1..4. The envelope round and phase are the ones the event was applied to.
    // version 1 = the teacher's startGame (two events, one action); version 2 = dave's gift.
    // frank's gift is rejected, so its row keeps version 2 and changes nothing (EVT-003, ARCH-014).
    const base = { game_id: activeGame.game_id, round: 1 } as const;
    await tx.insert(events).values([
      {
        ...base,
        seq: 1,
        version: 1,
        phase: "lobby",
        actor_type: "teacher",
        teacher_id: TEACHER,
        outcome: "applied",
        client_action_id: "seed-action-1",
        type: "game.started",
        payload: payload("game.started", {
          scenario: "lc2-default",
          seed: 67890,
          at: STARTED_AT,
        }),
      },
      {
        ...base,
        seq: 2,
        version: 1,
        phase: "lobby",
        actor_type: "teacher",
        teacher_id: TEACHER,
        outcome: "applied",
        client_action_id: "seed-action-1",
        type: "phase.advanced",
        payload: payload("phase.advanced", {
          from: "lobby",
          to: "auction",
          round: 1,
          at: STARTED_AT,
        }),
      },
      {
        ...base,
        seq: 3,
        version: 2,
        phase: "auction",
        actor_type: "player",
        participant_id: dave.participant_id,
        team_id: red.team_id,
        outcome: "applied",
        client_action_id: "seed-action-2",
        type: "trade.gift_sent",
        payload: payload("trade.gift_sent", {
          fromTeam: "red",
          toTeam: "blue",
          resource: "lumber",
          amount: 2,
          fromBefore: 4,
          toBefore: 4,
        }),
      },
      {
        ...base,
        seq: 4,
        version: 2,
        phase: "auction",
        actor_type: "player",
        participant_id: frank.participant_id,
        team_id: blue.team_id,
        outcome: "rejected",
        error_code: "NOT_ENOUGH_RESOURCES",
        client_action_id: "seed-action-3",
        type: "trade.gift_sent",
        payload: payload("trade.gift_sent", {
          fromTeam: "blue",
          toTeam: "green",
          resource: "copper",
          amount: 50,
          fromBefore: 4,
          toBefore: 4,
        }),
      },
    ]);

    console.log(
      `Seeded games ${lobbyGame.room_code} (lobby) and ${activeGame.room_code} (auction)`,
    );
  });
}

// Only runs when called directly (npm run db:seed), not when a test imports seed()
// ./index is imported here so importing this file does not open the real database
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { db } = await import("./index");
  // Checked after ./index loads the repo-root .env. Seeding deletes every game, so a real database needs an explicit opt-in
  if (process.env.DATABASE_URL && process.env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      "Refusing to seed: DATABASE_URL is set. Unset it to seed local PGlite, or set SEED_ALLOW_REMOTE=1 to wipe that database.",
    );
  }
  seed(db)
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      // Close the connection so the script exits
      const client = db.$client;
      if (client instanceof PGlite) await client.close();
      else await client.end();
    });
}
