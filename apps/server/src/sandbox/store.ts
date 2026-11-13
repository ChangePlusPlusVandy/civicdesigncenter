// Where sandbox games are saved so they survive restarts and deploys: a
// snapshot per game plus the append-only research log. Postgres (Neon) when
// DATABASE_URL is set, otherwise PGlite on disk, the same drivers as the
// main schema work (#70). The tables are prefixed `sandbox_` so they never
// meet that schema's tables or migrations.

import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import type { CityId, Contribution, IdleState, LoggedEvent } from "@cs/idle";

// A student as saved: a token hash, never the token.
export interface SavedPlayer {
  id: string;
  // SHA-256 of the player's token; the token itself is never stored.
  tokenHash: string;
  name: string;
  cityId: CityId;
}

// Everything needed to bring a game back after a restart.
export interface SavedGame {
  code: string;
  state: IdleState;
  version: number;
  teacherTokenHash: string;
  players: SavedPlayer[];
  contributions: Record<string, Contribution>;
  seq: number;
  lastActivity: number;
  // Recent clientActionIds and the version each produced, so a client that
  // retries after a restart doesn't repeat its action.
  seen?: [string, number][];
}

// Where games and their research logs are saved.
export interface GameStore {
  init(): Promise<void>;
  // Games touched since `since` (ms since the epoch).
  loadGames(since: number): Promise<SavedGame[]>;
  saveGame(game: SavedGame): Promise<void>;
  appendEvents(code: string, rows: LoggedEvent[]): Promise<void>;
  // The newest `limit` events, oldest first; every event without a limit.
  loadEvents(code: string, limit?: number): Promise<LoggedEvent[]>;
  close(): Promise<void>;
}

// Nothing is saved: for tests and for running without a database.
export class MemoryStore implements GameStore {
  private readonly games = new Map<string, SavedGame>();
  private readonly events = new Map<string, LoggedEvent[]>();

  async init() {}

  async loadGames(since: number) {
    return [...this.games.values()].filter((game) => game.lastActivity > since);
  }

  async saveGame(game: SavedGame) {
    this.games.set(game.code, structuredClone(game));
  }

  async appendEvents(code: string, rows: LoggedEvent[]) {
    const list = this.events.get(code) ?? [];
    const known = new Set(list.map((row) => row.seq));
    list.push(...rows.filter((row) => !known.has(row.seq)));
    this.events.set(code, list);
  }

  async loadEvents(code: string, limit?: number) {
    const list = this.events.get(code) ?? [];
    return limit === undefined ? [...list] : list.slice(-limit);
  }

  async close() {}
}

interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Saves to Postgres or PGlite, in the sandbox_games and sandbox_events tables.
// Creating the tables and appending log rows are both safe to repeat.
export class SqlStore implements GameStore {
  constructor(
    private readonly db: Queryable,
    private readonly onClose: () => Promise<void> = async () => {},
  ) {}

  async init() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sandbox_games (
        code text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS sandbox_events (
        code text NOT NULL,
        seq integer NOT NULL,
        data jsonb NOT NULL,
        PRIMARY KEY (code, seq)
      )`);
  }

  async loadGames(since: number) {
    const { rows } = await this.db.query<{ data: SavedGame | string }>(
      "SELECT data FROM sandbox_games WHERE updated_at > to_timestamp($1::double precision / 1000)",
      [since],
    );
    return rows.map((row) => parse<SavedGame>(row.data));
  }

  async saveGame(game: SavedGame) {
    await this.db.query(
      `INSERT INTO sandbox_games (code, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [game.code, JSON.stringify(game)],
    );
  }

  async appendEvents(code: string, rows: LoggedEvent[]) {
    if (!rows.length) return;
    const values = rows
      .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3}::jsonb)`)
      .join(", ");
    const params: unknown[] = [code];
    for (const row of rows) params.push(row.seq, JSON.stringify(row));
    await this.db.query(
      `INSERT INTO sandbox_events (code, seq, data) VALUES ${values} ON CONFLICT DO NOTHING`,
      params,
    );
  }

  async loadEvents(code: string, limit?: number) {
    const { rows } = await this.db.query<{ data: LoggedEvent | string }>(
      limit === undefined
        ? "SELECT data FROM sandbox_events WHERE code = $1 ORDER BY seq"
        : "SELECT data FROM (SELECT seq, data FROM sandbox_events WHERE code = $1 ORDER BY seq DESC LIMIT $2) newest ORDER BY seq",
      limit === undefined ? [code] : [code, limit],
    );
    return rows.map((row) => parse<LoggedEvent>(row.data));
  }

  async close() {
    await this.onClose();
  }
}

// pg returns jsonb already parsed; some drivers return text.
function parse<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

// Opens Postgres when a database URL is given, otherwise PGlite in a local
// folder.
export async function openStore(
  databaseUrl?: string,
  pgliteDir = "./.pglite-sandbox",
): Promise<GameStore> {
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return new SqlStore(pool, () => pool.end());
  }
  const lite = new PGlite(pgliteDir);
  return new SqlStore(lite, () => lite.close());
}
