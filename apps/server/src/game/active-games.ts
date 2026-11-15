// The games this server holds in memory (ARCH-053) and their per-game locks
// (ARCH-011). The action pipeline reads a game's state and version from here
// instead of the database, and writes them back after each commit. Every
// state write goes through the pipeline (ARCH-010), so the in-memory copy is
// current unless another process wrote the snapshot; the conditional update
// (ARCH-013) catches that case and the pipeline evicts and reloads the game.

import { Mutex } from "async-mutex";
import { eq, ne } from "drizzle-orm";
import type { GameState } from "@cs/engine";
import { games, snapshots } from "../db/drizzle-schema.ts";
import type { Db, SnapshotLoader } from "../realtime/index.ts";

export type LoadedGame = {
  gameId: number;
  scenarioId: string;
  phase: (typeof games.$inferSelect)["phase"];
  state: GameState;
  version: number;
};

const columns = {
  gameId: games.game_id,
  scenarioId: games.scenario_id,
  phase: games.phase,
  state: snapshots.state,
  version: snapshots.version,
};

export class ActiveGames {
  private readonly games = new Map<number, LoadedGame>();
  private readonly locks = new Map<number, Mutex>();

  constructor(private readonly getDb: () => Promise<Db> | Db) {}

  // ARCH-011: runs `task` once every earlier task for the same game has
  // settled. Tasks for different games run concurrently.
  runExclusive<T>(gameId: number, task: () => Promise<T>): Promise<T> {
    let lock = this.locks.get(gameId);
    if (!lock) {
      lock = new Mutex();
      this.locks.set(gameId, lock);
    }
    return lock.runExclusive(task);
  }

  // ARCH-053: loads every game whose phase is not `ended` from its latest
  // snapshot. Returns how many games it loaded.
  // TODO(#21): games.phase stays `lobby` until the phase state machine copies
  //   it from the snapshot (ARCH-055), so today every game is rehydrated.
  async rehydrate(): Promise<number> {
    const db = await this.getDb();
    const rows = await db
      .select(columns)
      .from(games)
      .innerJoin(snapshots, eq(snapshots.game_id, games.game_id))
      .where(ne(games.phase, "ended"));
    for (const row of rows) this.keepNewer(toLoaded(row));
    return rows.length;
  }

  // The game's latest state, from memory or else from the database (a game
  // created after boot). Null when the game has no snapshot.
  async get(gameId: number): Promise<LoadedGame | null> {
    const cached = this.games.get(gameId);
    if (cached) return cached;
    const db = await this.getDb();
    const [row] = await db
      .select(columns)
      .from(games)
      .innerJoin(snapshots, eq(snapshots.game_id, games.game_id))
      .where(eq(games.game_id, gameId))
      .limit(1);
    if (!row) return null;
    // A concurrent load may have finished first; never replace a newer state.
    return this.keepNewer(toLoaded(row));
  }

  has(gameId: number): boolean {
    return this.games.has(gameId);
  }

  // Stores the state the pipeline has just committed.
  set(game: LoadedGame) {
    this.games.set(game.gameId, game);
  }

  // Drops a game whose in-memory copy may be stale (ARCH-013), so the next
  // get() reloads it.
  evict(gameId: number) {
    this.games.delete(gameId);
  }

  // A SnapshotLoader for Realtime that answers from memory (ARCH-021).
  snapshotLoader(): SnapshotLoader {
    return async (gameId) => {
      const game = await this.get(gameId);
      return game ? { state: game.state, version: game.version } : null;
    };
  }

  private keepNewer(game: LoadedGame): LoadedGame {
    const cached = this.games.get(game.gameId);
    if (cached && cached.version >= game.version) return cached;
    this.games.set(game.gameId, game);
    return game;
  }
}

function toLoaded(row: {
  gameId: number;
  scenarioId: string;
  phase: LoadedGame["phase"];
  state: unknown;
  version: number;
}): LoadedGame {
  return { ...row, state: row.state as GameState };
}
