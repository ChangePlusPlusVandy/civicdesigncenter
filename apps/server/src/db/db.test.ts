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
import { eq } from "drizzle-orm";
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
});

describe("games", () => {
  test("defaults: lobby status, unlocked, created_at set", async () => {
    const game = await makeGame(db);
    expect(game.game_status).toBe("lobby");
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

  test("game_status rejects values outside the enum", async () => {
    await expectDbError(
      makeGame(db, { game_status: "paused" as any }),
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

  test("role defaults to seat", async () => {
    const game = await makeGame(db);
    const player = await makePlayer(db, game.game_id);
    expect(player.role).toBe("seat");
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
      actor_type: "participant",
      participant_id,
      client_action_id: "a1",
      version: 1,
    } as const;
    await makeEvent(db, game.game_id, { ...event, seq: 1 });
    await makeEvent(db, game.game_id, { ...event, seq: 2 });
    expect(await db.$count(events, eq(events.game_id, game.game_id))).toBe(2);
  });

  test("defaults: payload {}, round 0, phase null, outcome applied, schema_version 1, server_timestamp set", async () => {
    const game = await makeGame(db);
    const event = await makeEvent(db, game.game_id);
    expect(event.payload).toEqual({});
    expect(event.round).toBe(0);
    expect(event.phase).toBeNull();
    expect(event.outcome).toBe("applied");
    expect(event.schema_version).toBe(1);
    expect(event.server_timestamp).toBeInstanceOf(Date);
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
      error_code: "INSUFFICIENT_FUNDS",
    });
    expect(event.outcome).toBe("rejected");
    expect(event.error_code).toBe("INSUFFICIENT_FUNDS");
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

  test("deleting a team keeps its events with team_id = null", async () => {
    const game = await makeGame(db);
    const team = await makeTeam(db, game.game_id);
    const event = await makeEvent(db, game.game_id, { team_id: team.team_id });

    await db.delete(teams).where(eq(teams.team_id, team.team_id));

    const [after] = await db
      .select()
      .from(events)
      .where(eq(events.event_id, event.event_id));
    expect(after, "event should still exist").toMatchObject({ team_id: null });
  });

  test("phase, actor_type and outcome reject values outside their enums", async () => {
    const game = await makeGame(db);
    await expectDbError(
      makeEvent(db, game.game_id, { phase: "auction" as any }),
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
        actor_type: "participant",
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
    expect(await db.$count(events)).toBe(3);
  });
});

// Add these once the game logic exists
test.todo(
  "applying an action inserts an event and bumps snapshots.version in one transaction",
);
test.todo(
  "two concurrent actions on the same version: one succeeds, the other is rejected",
);
