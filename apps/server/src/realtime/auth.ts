import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../db/drizzle-schema.ts";
import { players, teams } from "../db/drizzle-schema.ts";
import { hashToken } from "../db/tokens.ts";

// Either driver from db/index.ts (pg or PGlite).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// Who a socket is, derived on the server from its credentials; clients never
// send it (ARCH-010). The pipeline builds the engine actor from it.
export type SocketSession =
  | {
      kind: "player";
      gameId: number;
      participantId: string;
      teamId: number | null;
      // teams.city_key of the player's team (ARCH-017); null without a team.
      cityId: string | null;
      // ARCH-031; `seat` by default.
      role: string;
      // Kept so a re-join can disconnect sockets opened with the old token
      // (ARCH-035). Never sent to clients or logged (ARCH-082).
      tokenHash: string;
    }
  | { kind: "teacher"; gameId: number; teacherId: string }
  | { kind: "projector"; gameId: number };

// The handshake's `auth` payload (ARCH-032) and headers, so a teacher
// authenticator can read the Better Auth cookie (#24).
export type Handshake = {
  auth: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
};

// Resolves a handshake to a session, or null to reject it. Throwing rejects
// the connection with INTERNAL.
export type Authenticator = (
  handshake: Handshake,
) => Promise<SocketSession | null>;

// Players: the game-scoped bearer token in `auth.token`. The server stores
// only its hash (ARCH-030); a re-join overwrites the hash, so an old token
// stops matching (ARCH-033). Kicked players are refused. Selects no
// username (EVT-008).
export function playerTokenAuth(getDb: () => Promise<Db> | Db): Authenticator {
  return async ({ auth }) => {
    const token = auth.token;
    if (typeof token !== "string" || token.length === 0) return null;
    const tokenHash = hashToken(token);
    const db = await getDb();
    const [row] = await db
      .select({
        gameId: players.game_id,
        participantId: players.participant_id,
        teamId: players.team_id,
        role: players.role,
        cityId: teams.city_key,
      })
      .from(players)
      .leftJoin(teams, eq(teams.team_id, players.team_id))
      .where(and(eq(players.token_hash, tokenHash), isNull(players.kicked_at)))
      .limit(1);
    if (!row) return null;
    return { kind: "player", ...row, tokenHash };
  };
}

// Tries each authenticator in order; the first session wins.
export function anyOf(...authenticators: Authenticator[]): Authenticator {
  return async (handshake) => {
    for (const authenticate of authenticators) {
      const session = await authenticate(handshake);
      if (session) return session;
    }
    return null;
  };
}
