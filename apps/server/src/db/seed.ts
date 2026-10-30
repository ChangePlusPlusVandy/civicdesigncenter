// Seed data for local development: npm run db:seed
// Run the migrations first (npm run db:push) so the tables exist.
// Wipes every game (cascades to teams, players, game_roles, snapshots, events) and inserts:
//   - game 1 "LOBBY1": lobby, 2 teams, 3 players (one without a team yet), no events
//   - game 2 "PLAY01": active in round 1, 3 teams, 6 players, snapshot at version 3 with matching events
// seed(db) is exported so tests can run it on an in-memory database.

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type * as dbModule from "./index";
import {
  games,
  teams,
  players,
  game_roles,
  snapshots,
  events,
} from "./drizzle-schema";

type Db = typeof dbModule.db;

// .returning() is typed as an array; these name the rows each insert below is known to return
type Game = typeof games.$inferSelect;
type Team = typeof teams.$inferSelect;
type Player = typeof players.$inferSelect;

// Fake player tokens, only the hash is stored (same as the real join flow should do)
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function seed(db: Db) {
  await db.delete(games);

  //GAMES
  const [lobbyGame, activeGame] = (await db
    .insert(games)
    .values([
      { scenario_id: 1, room_code: "LOBBY1", rng_seed: 12345, max_size: 8 },
      {
        scenario_id: 1,
        room_code: "PLAY01",
        rng_seed: 67890,
        max_size: 12,
        game_status: "active",
        locked: true,
        started_at: new Date(),
      },
    ])
    .returning()) as [Game, Game];

  //GAME ROLES: user_id is a placeholder until the Better Auth user table exists
  await db.insert(game_roles).values([
    { game_id: lobbyGame.game_id, user_id: "seed-teacher-1", role: "owner" },
    { game_id: activeGame.game_id, user_id: "seed-teacher-1", role: "owner" },
    { game_id: activeGame.game_id, user_id: "seed-teacher-2", role: "player" },
  ]);

  //TEAMS
  const [lobbyNorth, lobbySouth] = (await db
    .insert(teams)
    .values([
      { game_id: lobbyGame.game_id, name: "North Traders", city_key: "denver" },
      { game_id: lobbyGame.game_id, name: "South Traders", city_key: "austin" },
    ])
    .returning()) as [Team, Team];

  const [red, blue, green] = (await db
    .insert(teams)
    .values([
      { game_id: activeGame.game_id, name: "Red Team", city_key: "chicago" },
      { game_id: activeGame.game_id, name: "Blue Team", city_key: "seattle" },
      { game_id: activeGame.game_id, name: "Green Team", city_key: "miami" },
    ])
    .returning()) as [Team, Team, Team];

  //PLAYERS
  await db.insert(players).values([
    {
      game_id: lobbyGame.game_id,
      team_id: lobbyNorth.team_id,
      username: "alice",
      token_hash: hashToken("alice-token"),
    },
    {
      game_id: lobbyGame.game_id,
      team_id: lobbySouth.team_id,
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

  const activePlayers = await db
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

  const [dave, , frank, , heidi] = activePlayers as [
    Player,
    Player,
    Player,
    Player,
    Player,
    Player,
  ];

  //SNAPSHOTS: one row per game, version = number of events applied
  await db.insert(snapshots).values([
    {
      game_id: lobbyGame.game_id,
      version: 0,
      state: { round: 0, phase: null, teams: {} },
    },
    {
      game_id: activeGame.game_id,
      version: 3,
      state: {
        round: 1,
        phase: "bids",
        teams: {
          [red.team_id]: { cash: 1000, bid: 150 },
          [blue.team_id]: { cash: 1000, bid: 120 },
          [green.team_id]: { cash: 1000, bid: 200 },
        },
      },
    },
  ]);

  //EVENTS: seq and versions 1..3 match the active game's snapshot version
  // FIX: type was "bid_placed", which is not in catalog.ts. These are now auction.bid_changed with the catalog payload
  //   (each team raises its bid on the same lot from 0). team_id left the payload: it belongs to the envelope
  //   (events.team_id). catalog.test.ts checks these payloads against the catalog.
  const bid = (after: number) => ({
    lot: "lot-1",
    resource: "cash",
    before: 0,
    after,
    delta: after,
    requested: after,
  });
  const bidEvent = {
    game_id: activeGame.game_id,
    actor_type: "participant",
    round: 1,
    phase: "bids",
    type: "auction.bid_changed",
  } as const;
  await db.insert(events).values([
    {
      ...bidEvent,
      seq: 1,
      version: 1,
      participant_id: dave.participant_id,
      team_id: red.team_id,
      client_action_id: "seed-action-1",
      payload: bid(150),
    },
    {
      ...bidEvent,
      seq: 2,
      version: 2,
      participant_id: frank.participant_id,
      team_id: blue.team_id,
      client_action_id: "seed-action-2",
      payload: bid(120),
    },
    {
      ...bidEvent,
      seq: 3,
      version: 3,
      participant_id: heidi.participant_id,
      team_id: green.team_id,
      client_action_id: "seed-action-3",
      payload: bid(200),
    },
  ]);

  console.log(
    `Seeded games ${lobbyGame.room_code} (lobby) and ${activeGame.room_code} (active)`,
  );
}

// Only runs when called directly (npm run db:seed), not when a test imports seed()
// ./index is imported here so importing this file does not open the real database
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { db } = await import("./index");
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
