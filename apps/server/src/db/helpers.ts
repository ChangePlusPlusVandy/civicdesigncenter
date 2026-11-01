// Test helpers: fresh in-memory database, row factories, and a DB error assertion
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect } from "vitest";
import * as schema from "./drizzle-schema";
import { games, teams, players, events } from "./drizzle-schema";

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// New in-memory database with all migrations applied (run npm run db:generate first)
export async function createTestDb() {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  return db;
}

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// Keeps room codes / usernames / cities unique between calls
let counter = 0;
const next = () => ++counter;

// .returning() is typed as an array, so fail loudly here instead of handing undefined to the test
function single<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("insert returned no row");
  return row;
}

//FACTORIES: sensible defaults, pass overrides for the column under test
export async function makeGame(
  db: TestDb,
  overrides: Partial<typeof games.$inferInsert> = {},
) {
  return single(
    await db
      .insert(games)
      .values({
        scenario_id: 1,
        room_code: `R${next()}`,
        rng_seed: 1,
        ...overrides,
      })
      .returning(),
  );
}

export async function makeTeam(
  db: TestDb,
  game_id: number,
  overrides: Partial<typeof teams.$inferInsert> = {},
) {
  return single(
    await db
      .insert(teams)
      .values({
        game_id,
        name: `Team ${next()}`,
        city_key: `city-${next()}`,
        ...overrides,
      })
      .returning(),
  );
}

export async function makePlayer(
  db: TestDb,
  game_id: number,
  overrides: Partial<typeof players.$inferInsert> = {},
) {
  const n = next();
  return single(
    await db
      .insert(players)
      .values({
        game_id,
        username: `player${n}`,
        token_hash: hashToken(`token-${n}`),
        ...overrides,
      })
      .returning(),
  );
}

// Defaults to a system event (no participant, no team) with a fresh seq
export async function makeEvent(
  db: TestDb,
  game_id: number,
  overrides: Partial<typeof events.$inferInsert> = {},
) {
  return single(
    await db
      .insert(events)
      .values({
        game_id,
        seq: next(),
        actor_type: "system",
        version: 1,
        type: "x",
        ...overrides,
      })
      .returning(),
  );
}

//POSTGRES ERROR CODES used by the constraint tests
export const PG = {
  UNIQUE: "23505",
  FOREIGN_KEY: "23503",
  NOT_NULL: "23502",
  INVALID_ENUM: "22P02",
  TOO_LONG: "22001",
} as const;

// Drizzle wraps driver errors in DrizzleQueryError, the Postgres error is on .cause
export async function expectDbError(
  query: Promise<unknown>,
  code: string,
  constraint?: string,
) {
  const err: any = await query.then(
    () => {
      throw new Error("expected the query to fail");
    },
    (e: unknown) => e,
  );
  const pgErr = err?.cause ?? err;
  expect(pgErr.code).toBe(code);
  if (constraint) expect(pgErr.constraint).toBe(constraint);
}
