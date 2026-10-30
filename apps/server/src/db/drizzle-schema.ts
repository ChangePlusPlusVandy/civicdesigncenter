//TWO BIG THINGS: seq I defualted to 0, and actor_type to "system" in events table. Snapshots table in this schema holds latest state while snapshots in catalog.ts holds per game. It can be consolidated if that is what is wanted.

// Drizzle schema: games, players, teams, game_roles, snapshots (state JSON + version), events
// Driver chosen by DATABASE_URL: blank = PGlite (./pglite/), otherwise pg
// Tests run on in-memory PGlite

// Dependency of Tables: games -> teams -> players -> game_roles
// games -> snapshots -> events

import {
  jsonb,
  bigint,
  uuid,
  boolean,
  integer,
  pgTable,
  index,
  varchar,
  timestamp,
  text,
  pgEnum,
  uniqueIndex,
  unique,
  primaryKey,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// The options for phases can be changed and should once the game is fully designed.
export const phaseEnum = pgEnum("phase", ["bids", "sell", "trade"]);

//The options for game status can be changed and should be once the game is fully designed
export const gameStatusEnum = pgEnum("game_status", [
  "lobby",
  "active",
  "ended",
]);

export const roleEnum = pgEnum("roles", ["owner", "player"]);

// Event envelope enums. log.ts reads their values, so the zod envelope and the table cannot drift apart
export const actorTypeEnum = pgEnum("actor_type", [
  "participant",
  "teacher",
  "system",
]);
export const outcomeEnum = pgEnum("outcome", ["applied", "rejected"]);

//REQUIRED COLUMNS (cannot be changed): game_id, created_at, started_at, ended_at
// The other columns can be changed depending on what the game system flow is.
export const games = pgTable("games", {
  game_id: integer().generatedByDefaultAsIdentity().primaryKey(),
  scenario_id: integer().notNull(),
  room_code: varchar({ length: 10 }).notNull().unique(),
  rng_seed: integer().notNull(),
  game_status: gameStatusEnum().default("lobby").notNull(),
  max_size: integer(),
  locked: boolean().default(false).notNull(),

  created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  started_at: timestamp({ withTimezone: true }),
  ended_at: timestamp({ withTimezone: true }),
});

//REQUIRED COLUMNS (cannot be changed): team_id, game_id, created_at
// More columns can be added if there are more features for teams
// INDEX: game_id => city key, don't change city key without changing the index
// UNIQUE: team_id + game_id, target of the players composite FK, don't remove
export const teams = pgTable(
  "teams",
  {
    team_id: integer().generatedByDefaultAsIdentity().primaryKey(),
    game_id: integer()
      .notNull()
      .references(() => games.game_id, { onDelete: "cascade" }),
    name: varchar({ length: 20 }).notNull(),
    city_key: text().notNull(),

    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("games_teams_city_index").on(t.game_id, t.city_key),
    unique("teams_team_game_unique").on(t.team_id, t.game_id),
  ],
);

//REQUIRED COLUMNS (cannot be changed): player_id, participant_id, game_id, team_id, created_at
//The rest of the columns can be altered or more added
//INDEX: game_id => username, don't change username without changing the index
//FK: (team_id, game_id) -> teams, keeps a player's team inside the player's game
export const players = pgTable(
  "players",
  {
    player_id: integer().generatedByDefaultAsIdentity().primaryKey(),
    participant_id: uuid().defaultRandom().notNull().unique(),
    game_id: integer()
      .notNull()
      .references(() => games.game_id, { onDelete: "cascade" }),
    team_id: integer().references(() => teams.team_id, {
      onDelete: "set null",
    }), // null = no team yet (lobby)
    username: text().notNull(),
    role: text().default("seat").notNull(),
    token_hash: text().notNull(),
    kicked_at: timestamp({ withTimezone: true }),
    last_seen: timestamp({ withTimezone: true }),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("players_names_games_index").on(t.game_id, t.username),
    index("players_team_idx").on(t.team_id),
    foreignKey({
      name: "players_team_same_game_fk",
      columns: [t.team_id, t.game_id],
      foreignColumns: [teams.team_id, teams.game_id],
    }),
  ],
);

//This whole table can be redesigned (very much not set in stone)
//PRIMARY KEY: game_id + user_id
export const game_roles = pgTable(
  "game_roles",
  {
    game_id: integer()
      .notNull()
      .references(() => games.game_id, { onDelete: "cascade" }),
    user_id: text().notNull(), // Better Auth user.id; add .references() once the auth schema exists
    role: roleEnum().default("owner").notNull(),
    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.game_id, t.user_id] })],
);

//REQUIRED COLUMNS: game_id, version, state, updated_at
//More columns can be added but is not recommended, this should be easy data to grab and kept minimal
//One row per game. Update changes the data in this row,  v+=1 for every update
export const snapshots = pgTable("snapshots", {
  game_id: integer()
    .primaryKey()
    .references(() => games.game_id, { onDelete: "cascade" }),
  version: integer().default(0).notNull(),
  state: jsonb().notNull(),
  updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

//REQUIRED COLUMNS: event_id, game_id, participant_id, client_action_id, version,payload,server_timestamp
//This table is very delicate in any changes that can be applied. Don't change too much
//INDEX: game_id => version, participant_id => client_action_id, not unique because it is one to many relationships.

//WHO: participant events set participant_id, teacher events set teacher_id, system events set neither (log.ts checks this)
//TEAM: null for game-wide events (phase.advanced, game.*, ...). FK (team_id, game_id) -> teams keeps it inside the event's game
//SEQ: per-game and gapless, assigned by the server in the same transaction as the insert. UNIQUE: game_id + seq
//SNAPSHOTS PER ROUND: stored here as round.snapshot rows (see catalog.ts); the snapshots table keeps only the latest state
export const events = pgTable(
  "events",
  {
    event_id: bigint({ mode: "number" })
      .generatedByDefaultAsIdentity()
      .primaryKey(),
    game_id: integer()
      .notNull()
      .references(() => games.game_id, { onDelete: "cascade" }),
    seq: integer().default(0).notNull(), // 1, 2, 3... per game, no gaps
    schema_version: integer().default(1).notNull(), // bump when a payload shape in catalog.ts changes
    actor_type: actorTypeEnum().default("system").notNull(),
    participant_id: uuid(), // players.participant_id, null for teacher and system events
    teacher_id: text(), // game_roles.user_id (Better Auth id, not a uuid), null unless actor_type = teacher
    team_id: integer().references(() => teams.team_id, {
      onDelete: "set null",
    }), // null for game-wide events
    client_action_id: text(), // not unique: one action can produce several events
    version: integer().notNull(), // snapshot version this event produced
    outcome: outcomeEnum().default("applied").notNull(),
    error_code: text(), // set only when outcome = rejected
    round: integer().default(0).notNull(),
    phase: phaseEnum(), // null outside a phase (e.g. lobby)
    type: text().notNull(),
    payload: jsonb().default({}).notNull(),
    server_timestamp: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("events_game_seq_index").on(t.game_id, t.seq),
    index("events_game_version_idx").on(t.game_id, t.version), //one to many relationship
    index("events_participant_action_idx").on(
      t.participant_id,
      t.client_action_id,
    ), //one to many relationship
    index("events_team_idx").on(t.team_id),
    foreignKey({
      name: "events_team_same_game_fk",
      columns: [t.team_id, t.game_id],
      foreignColumns: [teams.team_id, teams.game_id],
    }),
  ],
);

//RELATIONS: only used by db.query (relational queries), they do not create anything in the database
export const gamesRelations = relations(games, ({ one, many }) => ({
  teams: many(teams),
  players: many(players),
  roles: many(game_roles),
  snapshot: one(snapshots),
  events: many(events),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  game: one(games, { fields: [teams.game_id], references: [games.game_id] }),
  players: many(players),
  events: many(events),
}));

export const playersRelations = relations(players, ({ one }) => ({
  game: one(games, { fields: [players.game_id], references: [games.game_id] }),
  team: one(teams, { fields: [players.team_id], references: [teams.team_id] }),
}));

export const gameRolesRelations = relations(game_roles, ({ one }) => ({
  game: one(games, {
    fields: [game_roles.game_id],
    references: [games.game_id],
  }),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  game: one(games, {
    fields: [snapshots.game_id],
    references: [games.game_id],
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  game: one(games, { fields: [events.game_id], references: [games.game_id] }),
  team: one(teams, { fields: [events.team_id], references: [teams.team_id] }),
}));
