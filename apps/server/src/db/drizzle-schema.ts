// Drizzle schema: games, players, teams, game_roles, snapshots (state JSON + version), events (ARCH-050)
// Driver chosen by DATABASE_URL: blank = PGlite (apps/server/.pglite/), otherwise pg (ARCH-051)
// Tests run on in-memory PGlite
// The idle-builder sandbox keeps its own sandbox_* tables outside this schema and these migrations (ARCH-091);
//   drizzle.config.ts filters them out so drizzle-kit never touches them.

// Dependency of Tables: games -> teams -> players -> game_roles
// games -> snapshots -> events

import {
  jsonb,
  check,
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
import { relations, sql } from "drizzle-orm";
import {
  actorTypes,
  outcomes,
  phases,
  SCHEMA_VERSION,
} from "@cs/shared/catalog";

// EVENTS.md §4: the values live in the event catalog, so the database enums and the catalog cannot drift apart
export const phaseEnum = pgEnum("phase", phases);
export const actorTypeEnum = pgEnum("actor_type", actorTypes);
export const outcomeEnum = pgEnum("outcome", outcomes);

export const roleEnum = pgEnum("roles", ["owner", "player"]);

//REQUIRED COLUMNS (cannot be changed): game_id, created_at, started_at, ended_at
// The other columns can be changed depending on what the game system flow is.
export const games = pgTable(
  "games",
  {
    game_id: integer().generatedByDefaultAsIdentity().primaryKey(),
    scenario_id: text().notNull(),
    room_code: varchar({ length: 10 }).notNull().unique(),
    rng_seed: bigint({ mode: "number" }).notNull(), // uint32, too large for a signed integer column
    // ARCH-053: copies of the latest snapshot's phase and paused flag (GAME-RULES §3), written in the same
    //   transaction as the snapshot, so boot can find the games to rehydrate without reading every state
    phase: phaseEnum().default("lobby").notNull(),
    paused: boolean().default(false).notNull(),
    max_size: integer(),
    locked: boolean().default(false).notNull(),

    created_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
    started_at: timestamp({ withTimezone: true }),
    ended_at: timestamp({ withTimezone: true }),
  },
  (t) => [
    // EVENTS.md §5.1 RNG values: a uint32, the same seed game.started logs
    check("games_rng_seed_check", sql`${t.rng_seed} BETWEEN 0 AND 4294967295`),
  ],
);

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
    // ARCH-031: text, so per-player roles can be added without a migration. Every role is allowed every
    //   player action (ARCH-015); can() in packages/shared is the only reader
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
//One row per game: the latest state, for rehydration (ARCH-052, ARCH-053). Each accepted action updates it
//  WHERE version = v and sets version = v + 1 (ARCH-013). The per-round copies are round.snapshot events (EVT-007)
export const snapshots = pgTable(
  "snapshots",
  {
    game_id: integer()
      .primaryKey()
      .references(() => games.game_id, { onDelete: "cascade" }),
    version: integer().default(0).notNull(),
    state: jsonb().notNull(), // the engine's GameState, plain JSON
    updated_at: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check("snapshots_version_check", sql`${t.version} >= 0`)],
);

//REQUIRED COLUMNS: event_id, game_id, participant_id, client_action_id, version,payload,server_timestamp
//This table is very delicate in any changes that can be applied. Don't change too much
//INDEX: game_id => version, participant_id => client_action_id, not unique because it is one to many relationships.

//WHO: player events set participant_id, teacher events set teacher_id, system events set neither (log.ts checks this)
//TEAM: null for game-wide events (phase.advanced, game.*, ...). FK (team_id, game_id) -> teams keeps it inside the event's game
//SEQ: per-game and gapless, assigned by the server in the same transaction as the insert. UNIQUE: game_id + seq
//SNAPSHOTS PER ROUND: stored here as round.snapshot rows (EVT-007, ARCH-052); the snapshots table keeps only the latest state
export const events = pgTable(
  "events",
  {
    event_id: bigint({ mode: "number" })
      .generatedByDefaultAsIdentity()
      .primaryKey(),
    game_id: integer()
      .notNull()
      .references(() => games.game_id, { onDelete: "cascade" }),
    seq: integer().notNull(), // 1, 2, 3... per game, no gaps
    schema_version: integer().default(SCHEMA_VERSION).notNull(), // EVT-010: catalog version of the payload
    actor_type: actorTypeEnum().notNull(),
    participant_id: uuid(), // players.participant_id, null for teacher and system events
    teacher_id: text(), // game_roles.user_id (Better Auth id, not a uuid), null unless actor_type = teacher
    team_id: integer().references(() => teams.team_id, {
      onDelete: "set null",
    }), // null for game-wide events
    client_action_id: text(), // not unique: one action can produce several events
    version: integer().notNull(), // snapshot version this event produced
    outcome: outcomeEnum().notNull(), // required, no default (EVT-003)
    error_code: text(), // set only when outcome = rejected (EVT-003, ARCH-014)
    round: integer().notNull(),
    phase: phaseEnum().notNull(), // phase in effect when the event was written
    type: text().notNull(),
    payload: jsonb().notNull(), // schema per type in catalog.ts (EVT-010)
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
    // EVENTS.md §3 ranges
    check("events_seq_check", sql`${t.seq} >= 1`),
    check("events_version_check", sql`${t.version} >= 0`),
    check("events_round_check", sql`${t.round} >= 1`),
    check("events_schema_version_check", sql`${t.schema_version} >= 1`),
    // EVT-003: rejected rows carry an error_code, applied rows do not
    check(
      "events_error_code_check",
      sql`(${t.outcome} = 'rejected') = (${t.error_code} IS NOT NULL)`,
    ),
    // EVT-025: who acted is fixed by actor_type
    check(
      "events_actor_ids_check",
      sql`
    (${t.actor_type} = 'player'
      AND ${t.participant_id} IS NOT NULL AND ${t.teacher_id} IS NULL)
    OR (${t.actor_type} = 'teacher'
      AND ${t.teacher_id} IS NOT NULL AND ${t.participant_id} IS NULL)
    OR (${t.actor_type} = 'system'
      AND ${t.participant_id} IS NULL AND ${t.teacher_id} IS NULL)
  `,
    ),
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
