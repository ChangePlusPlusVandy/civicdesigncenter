// Database tests: npm test
// One in-memory PGlite database per file, emptied before every test.
// Deleting all games is enough to empty it: every other table cascades from games.

import {
  test,
  describe,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "vitest";
import { eq, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { SCHEMA_VERSION } from "@cs/shared/catalog";
import { SqlStore } from "../sandbox/store";
import * as schema from "./drizzle-schema";
import {
  games,
  teams,
  players,
  game_roles,
  snapshots,
  events,
} from "./drizzle-schema";
import {
  createTestDb,
  makeGame,
  makeTeam,
  makePlayer,
  makeEvent,
  expectDbError,
  PG,
  type TestDb,
} from "./helpers";
import { seed } from "./seed";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await db.delete(games);
});

afterAll(async () => {
  await db.$client.close();
});

describe("migrations", () => {
  test("create every table", async () => {
    const result = await db.$client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const tables = result.rows.map((r) => r.table_name);
    for (const name of [
      "events",
      "game_roles",
      "games",
      "players",
      "snapshots",
      "teams",
    ]) {
      expect(tables).toContain(name);
    }
  });

  // ARCH-091: the sandbox shares the database and drivers but keeps its own sandbox_* tables
  test("coexist with the sandbox tables in one database", async () => {
    const ours = Object.values(schema)
      .filter((value) => is(value, PgTable))
      .map((table) => getTableName(table));
    expect(ours.length).toBeGreaterThan(0);
    for (const name of ours) expect(name.startsWith("sandbox_")).toBe(false);

    await new SqlStore(db.$client).init();
    const result = await db.$client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const tables = result.rows.map((r) => r.table_name);
    expect(tables).toEqual(
      expect.arrayContaining([...ours, "sandbox_games", "sandbox_events"]),
    );
  });
});

describe("games", () => {
  test("defaults: lobby phase, not paused, unlocked, created_at set", async () => {
    const game = await makeGame(db);
    expect(game.phase).toBe("lobby");
    expect(game.paused).toBe(false);
    expect(game.locked).toBe(false);
    expect(game.created_at).toBeInstanceOf(Date);
    expect(game.started_at).toBeNull();
  });

  test("room_code is unique", async () => {
    await makeGame(db, { room_code: "SAME" });
    await expectDbError(
      makeGame(db, { room_code: "SAME" }),
      PG.UNIQUE,
      "games_room_code_unique",
    );
  });

  test("scenario_id is required", async () => {
    await expectDbError(
      makeGame(db, { scenario_id: null as any }),
      PG.NOT_NULL,
    );
  });

  test("rng_seed is required", async () => {
    await expectDbError(makeGame(db, { rng_seed: null as any }), PG.NOT_NULL);
  });

  test("rng_seed stores the largest uint32", async () => {
    const game = await makeGame(db, { rng_seed: 0xffffffff });
    expect(game.rng_seed).toBe(0xffffffff);
  });

  // EVENTS.md section 5.1: seeds are uint32
  test("rng_seed outside uint32 is rejected", async () => {
    for (const rng_seed of [-1, 2 ** 32]) {
      await expectDbError(
        makeGame(db, { rng_seed }),
        PG.CHECK,
        "games_rng_seed_check",
      );
    }
  });

  test("max_size must be at least 1 when set", async () => {
    await expectDbError(
      makeGame(db, { max_size: 0 }),
      PG.CHECK,
      "games_max_size_check",
    );
    expect((await makeGame(db, { max_size: null })).max_size).toBeNull();
  });

  // GAME-RULES section 3: pause is the paused flag, not a phase
  test("phase rejects values outside the enum, including paused", async () => {
    await expectDbError(
      makeGame(db, { phase: "paused" as any }),
      PG.INVALID_ENUM,
    );
    await expectDbError(
      makeGame(db, { phase: "active" as any }),
      PG.INVALID_ENUM,
    );
  });
});

describe("teams", () => {
  test("game_id is required", async () => {
    await expectDbError(
      db
        .insert(teams)
        .values({ game_id: null as any, name: "No Game", city_key: "x" }),
      PG.NOT_NULL,
    );
  });

  test("game_id must point to an existing game", async () => {
    await expectDbError(makeTeam(db, 999999), PG.FOREIGN_KEY);
  });

  test("same city twice in one game is rejected", async () => {
    const game = await makeGame(db);
    await makeTeam(db, game.game_id, { city_key: "denver" });
    await expectDbError(
      makeTeam(db, game.game_id, { city_key: "denver" }),
      PG.UNIQUE,
      "games_teams_city_index",
    );
  });

  test("same city in two different games is allowed", async () => {
    const g1 = await makeGame(db);
    const g2 = await makeGame(db);
    await makeTeam(db, g1.game_id, { city_key: "denver" });
    await makeTeam(db, g2.game_id, { city_key: "denver" });
  });

  test("name longer than 20 characters is rejected", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeTeam(db, game.game_id, { name: "x".repeat(21) }),
      PG.TOO_LONG,
    );
  });
});

describe("players", () => {
  test("participant_id is generated and unique", async () => {
    const game = await makeGame(db);
    const p1 = await makePlayer(db, game.game_id);
    const p2 = await makePlayer(db, game.game_id);
    expect(p1.participant_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p1.participant_id).not.toBe(p2.participant_id);
    await expectDbError(
      makePlayer(db, game.game_id, { participant_id: p1.participant_id }),
      PG.UNIQUE,
      "players_participant_id_unique",
    );
  });

  test("same username twice in one game is rejected", async () => {
    const game = await makeGame(db);
    await makePlayer(db, game.game_id, { username: "alice" });
    await expectDbError(
      makePlayer(db, game.game_id, { username: "alice" }),
      PG.UNIQUE,
      "players_names_games_index",
    );
  });

  test("same username in two different games is allowed", async () => {
    const g1 = await makeGame(db);
    const g2 = await makeGame(db);
    await makePlayer(db, g1.game_id, { username: "alice" });
    await makePlayer(db, g2.game_id, { username: "alice" });
  });

  test("player without a team is allowed (lobby)", async () => {
    const game = await makeGame(db);
    const player = await makePlayer(db, game.game_id, { team_id: null });
    expect(player.team_id).toBeNull();
  });

  // ARCH-031
  test("role defaults to seat", async () => {
    const game = await makeGame(db);
    const player = await makePlayer(db, game.game_id);
    expect(player.role).toBe("seat");
  });

  test("role is text, so new roles need no migration", async () => {
    const game = await makeGame(db);
    const player = await makePlayer(db, game.game_id, { role: "trader" });
    expect(player.role).toBe("trader");
  });

  test("token_hash is required", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makePlayer(db, game.game_id, { token_hash: null as any }),
      PG.NOT_NULL,
    );
  });

  test("player cannot join a team from another game", async () => {
    const g1 = await makeGame(db);
    const g2 = await makeGame(db);
    const otherTeam = await makeTeam(db, g2.game_id);
    await expectDbError(
      makePlayer(db, g1.game_id, { team_id: otherTeam.team_id }),
      PG.FOREIGN_KEY,
      "players_team_same_game_fk",
    );
  });

  test("deleting a team keeps its players with team_id = null", async () => {
    const game = await makeGame(db);
    const team = await makeTeam(db, game.game_id);
    const player = await makePlayer(db, game.game_id, {
      team_id: team.team_id,
    });

    await db.delete(teams).where(eq(teams.team_id, team.team_id));

    const [after] = await db
      .select()
      .from(players)
      .where(eq(players.player_id, player.player_id));
    expect(after, "player should still exist").toMatchObject({ team_id: null });
  });
});

describe("game_roles", () => {
  test("role defaults to owner", async () => {
    const game = await makeGame(db);
    const [role] = await db
      .insert(game_roles)
      .values({ game_id: game.game_id, user_id: "u1" })
      .returning();
    expect(role?.role).toBe("owner");
  });

  test("same user twice in one game is rejected", async () => {
    const game = await makeGame(db);
    await db
      .insert(game_roles)
      .values({ game_id: game.game_id, user_id: "u1" });
    await expectDbError(
      db
        .insert(game_roles)
        .values({ game_id: game.game_id, user_id: "u1", role: "player" }),
      PG.UNIQUE,
      "game_roles_game_id_user_id_pk",
    );
  });

  test("role rejects values outside the enum", async () => {
    const game = await makeGame(db);
    await expectDbError(
      db
        .insert(game_roles)
        .values({ game_id: game.game_id, user_id: "u1", role: "admin" as any }),
      PG.INVALID_ENUM,
    );
  });
});

describe("snapshots", () => {
  test("version defaults to 0", async () => {
    const game = await makeGame(db);
    const [snap] = await db
      .insert(snapshots)
      .values({ game_id: game.game_id, state: {} })
      .returning();
    expect(snap?.version).toBe(0);
  });

  test("version cannot be negative", async () => {
    const game = await makeGame(db);
    await expectDbError(
      db
        .insert(snapshots)
        .values({ game_id: game.game_id, state: {}, version: -1 }),
      PG.CHECK,
      "snapshots_version_check",
    );
  });

  test("only one snapshot per game", async () => {
    const game = await makeGame(db);
    await db.insert(snapshots).values({ game_id: game.game_id, state: {} });
    await expectDbError(
      db.insert(snapshots).values({ game_id: game.game_id, state: {} }),
      PG.UNIQUE,
    );
  });

  test("state is stored and returned as JSON", async () => {
    const game = await makeGame(db);
    const state = { round: 2, teams: { "1": { cash: 500 } } };
    await db.insert(snapshots).values({ game_id: game.game_id, state });
    const [snap] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.game_id, game.game_id));
    expect(snap?.state).toEqual(state);
  });
});

describe("events", () => {
  test("game_id must point to an existing game", async () => {
    await expectDbError(makeEvent(db, 999999), PG.FOREIGN_KEY);
  });

  test("one action can produce several events with the same version", async () => {
    const game = await makeGame(db);
    const participant_id = crypto.randomUUID();
    const event = {
      actor_type: "player",
      participant_id,
      client_action_id: "a1",
      version: 1,
    } as const;
    await makeEvent(db, game.game_id, { ...event, seq: 1 });
    await makeEvent(db, game.game_id, { ...event, seq: 2 });
    expect(await db.$count(events, eq(events.game_id, game.game_id))).toBe(2);
  });

  test("defaults: schema_version is the catalog's SCHEMA_VERSION (EVT-010), server_timestamp set", async () => {
    const game = await makeGame(db);
    const event = await makeEvent(db, game.game_id);
    expect(event.schema_version).toBe(SCHEMA_VERSION);
    expect(event.server_timestamp).toBeInstanceOf(Date);
  });

  test("outcome and payload are required (no defaults)", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, { outcome: null as any }),
      PG.NOT_NULL,
    );
    await expectDbError(
      makeEvent(db, game.game_id, { payload: null as any }),
      PG.NOT_NULL,
    );
  });

  // EVENTS.md section 3: seq >= 1, version >= 0, round >= 1, schema_version >= 1
  test.each([
    ["seq", { seq: 0 }, "events_seq_check"],
    ["version", { version: -1 }, "events_version_check"],
    ["round", { round: 0 }, "events_round_check"],
    ["schema_version", { schema_version: 0 }, "events_schema_version_check"],
  ] as const)("%s out of range is rejected", async (_, overrides, check) => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, overrides),
      PG.CHECK,
      check,
    );
  });

  test("system event with no participant, teacher or team is allowed", async () => {
    const game = await makeGame(db);
    const event = await makeEvent(db, game.game_id, { type: "round.ended" });
    expect(event.participant_id).toBeNull();
    expect(event.teacher_id).toBeNull();
    expect(event.team_id).toBeNull();
  });

  test("teacher_id accepts a non-uuid auth id", async () => {
    const game = await makeGame(db);
    const event = await makeEvent(db, game.game_id, {
      actor_type: "teacher",
      teacher_id: "user_abc",
    });
    expect(event.teacher_id).toBe("user_abc");
  });

  test("rejected event stores its error_code", async () => {
    const game = await makeGame(db);
    const event = await makeEvent(db, game.game_id, {
      outcome: "rejected",
      error_code: "NOT_ENOUGH_RESOURCES",
    });
    expect(event.outcome).toBe("rejected");
    expect(event.error_code).toBe("NOT_ENOUGH_RESOURCES");
  });

  // EVT-003, ARCH-014
  test("error_code is set exactly when the event is rejected", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, { outcome: "rejected" }),
      PG.CHECK,
      "events_error_code_check",
    );
    await expectDbError(
      makeEvent(db, game.game_id, { error_code: "FORBIDDEN" }),
      PG.CHECK,
      "events_error_code_check",
    );
  });

  test("seq is unique per game", async () => {
    const g1 = await makeGame(db);
    const g2 = await makeGame(db);
    await makeEvent(db, g1.game_id, { seq: 1 });
    await makeEvent(db, g2.game_id, { seq: 1 });
    await expectDbError(
      makeEvent(db, g1.game_id, { seq: 1 }),
      PG.UNIQUE,
      "events_game_seq_index",
    );
  });

  test("seq is required", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, { seq: null as any }),
      PG.NOT_NULL,
    );
  });

  test("event cannot point at a team from another game", async () => {
    const g1 = await makeGame(db);
    const g2 = await makeGame(db);
    const otherTeam = await makeTeam(db, g2.game_id);
    await expectDbError(
      makeEvent(db, g1.game_id, { team_id: otherTeam.team_id }),
      PG.FOREIGN_KEY,
      "events_team_same_game_fk",
    );
  });

  // EVT-001: the log is append-only, so deleting a team must not rewrite its events
  test("a team with events cannot be deleted on its own", async () => {
    const game = await makeGame(db);
    const team = await makeTeam(db, game.game_id);
    const event = await makeEvent(db, game.game_id, { team_id: team.team_id });

    await expectDbError(
      db.delete(teams).where(eq(teams.team_id, team.team_id)),
      PG.FOREIGN_KEY,
    );

    const [after] = await db
      .select()
      .from(events)
      .where(eq(events.event_id, event.event_id));
    expect(after?.team_id).toBe(team.team_id);
  });

  test("deleting the game still removes its teams and team events", async () => {
    const game = await makeGame(db);
    const team = await makeTeam(db, game.game_id);
    await makeEvent(db, game.game_id, { team_id: team.team_id });

    await db.delete(games).where(eq(games.game_id, game.game_id));

    expect(
      await db.select().from(events).where(eq(events.game_id, game.game_id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(teams).where(eq(teams.game_id, game.game_id)),
    ).toHaveLength(0);
  });

  test("phase, actor_type and outcome reject values outside their enums", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, { phase: "bids" as any }),
      PG.INVALID_ENUM,
    );
    await expectDbError(
      makeEvent(db, game.game_id, { actor_type: "robot" as any }),
      PG.INVALID_ENUM,
    );
    await expectDbError(
      makeEvent(db, game.game_id, { outcome: "failed" as any }),
      PG.INVALID_ENUM,
    );
  });

  test("event_id increases with each insert", async () => {
    const game = await makeGame(db);
    const e1 = await makeEvent(db, game.game_id, { version: 1 });
    const e2 = await makeEvent(db, game.game_id, { version: 2 });
    expect(e2.event_id).toBeGreaterThan(e1.event_id);
  });

  describe("actor check", () => {
    const CHECK = "events_actor_ids_check";

    test("player event requires participant_id", async () => {
      const game = await makeGame(db);
      await expectDbError(
        makeEvent(db, game.game_id, { actor_type: "player" }),
        PG.CHECK,
        CHECK,
      );
    });

    test("teacher event requires teacher_id", async () => {
      const game = await makeGame(db);
      await expectDbError(
        makeEvent(db, game.game_id, { actor_type: "teacher" }),
        PG.CHECK,
        CHECK,
      );
    });

    test("system event cannot have a participant_id or teacher_id", async () => {
      const game = await makeGame(db);
      await expectDbError(
        makeEvent(db, game.game_id, { participant_id: crypto.randomUUID() }),
        PG.CHECK,
        CHECK,
      );
      await expectDbError(
        makeEvent(db, game.game_id, { teacher_id: "user_abc" }),
        PG.CHECK,
        CHECK,
      );
    });

    test("player event cannot have a teacher_id", async () => {
      const game = await makeGame(db);
      await expectDbError(
        makeEvent(db, game.game_id, {
          actor_type: "player",
          participant_id: crypto.randomUUID(),
          teacher_id: "user_abc",
        }),
        PG.CHECK,
        CHECK,
      );
    });

    test("teacher event cannot have a participant_id", async () => {
      const game = await makeGame(db);
      await expectDbError(
        makeEvent(db, game.game_id, {
          actor_type: "teacher",
          teacher_id: "user_abc",
          participant_id: crypto.randomUUID(),
        }),
        PG.CHECK,
        CHECK,
      );
    });
  });
});

describe("cascades", () => {
  test("deleting a game removes all its rows and leaves other games alone", async () => {
    const doomed = await makeGame(db);
    const kept = await makeGame(db);

    for (const game of [doomed, kept]) {
      const team = await makeTeam(db, game.game_id);
      const player = await makePlayer(db, game.game_id, {
        team_id: team.team_id,
      });
      await db
        .insert(game_roles)
        .values({ game_id: game.game_id, user_id: "teacher" });
      await db.insert(snapshots).values({ game_id: game.game_id, state: {} });
      await makeEvent(db, game.game_id, {
        actor_type: "player",
        participant_id: player.participant_id,
        team_id: team.team_id,
      });
    }

    await db.delete(games).where(eq(games.game_id, doomed.game_id));

    for (const [table, column] of [
      [teams, teams.game_id],
      [players, players.game_id],
      [game_roles, game_roles.game_id],
      [snapshots, snapshots.game_id],
      [events, events.game_id],
    ] as const) {
      expect(await db.$count(table, eq(column, doomed.game_id))).toBe(0);
      expect(await db.$count(table, eq(column, kept.game_id))).toBe(1);
    }
  });
});

describe("relations", () => {
  test("game loads with nested teams, players and snapshot", async () => {
    const game = await makeGame(db);
    const team = await makeTeam(db, game.game_id);
    await makePlayer(db, game.game_id, { team_id: team.team_id });
    await db
      .insert(snapshots)
      .values({ game_id: game.game_id, state: { round: 1 } });

    const loaded = await db.query.games.findFirst({
      where: eq(games.game_id, game.game_id),
      with: { teams: { with: { players: true } }, snapshot: true },
    });

    expect(loaded?.teams).toHaveLength(1);
    expect(loaded?.teams[0]?.players).toHaveLength(1);
    expect(loaded?.snapshot?.state).toEqual({ round: 1 });
  });
});

describe("seed", () => {
  test("runs twice without errors and leaves the expected row counts", async () => {
    await seed(db);
    await seed(db);
    expect(await db.$count(games)).toBe(2);
    expect(await db.$count(teams)).toBe(5);
    expect(await db.$count(players)).toBe(9);
    expect(await db.$count(game_roles)).toBe(3);
    expect(await db.$count(snapshots)).toBe(2);
    expect(await db.$count(events)).toBe(4);
  });
});

// Add these once the game logic exists
test.todo(
  "applying an action inserts an event and bumps snapshots.version in one transaction",
);
test.todo(
  "two concurrent actions on the same version: one succeeds, the other is rejected",
);
