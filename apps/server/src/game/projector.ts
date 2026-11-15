// TEMPORARY projector sign-in until #24 (ARCH-036). A game's projector key is
// an HMAC of the game's id and room code under SESSION_SECRET (prefixed
// `projector:`, so it signs nothing else), so it needs no table. A projector session receives only the `projector`
// projection (Realtime's audienceOf) and every action it sends is refused
// (pipeline.ts).

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { normalizeRoomCode } from "@cs/shared";
import { games } from "../db/drizzle-schema.ts";
import type { Authenticator, Db } from "../realtime/index.ts";

export type ProjectorGame = { game_id: number; room_code: string };

export function projectorKey(secret: string, game: ProjectorGame): string {
  return createHmac("sha256", secret)
    .update(`projector:${game.game_id}:${game.room_code}`)
    .digest("base64url");
}

// `auth: { roomCode, projectorKey }`. Without a secret every projector is
// refused.
export function projectorKeyAuth(
  getDb: () => Promise<Db> | Db,
  secret: string | undefined,
): Authenticator {
  return async ({ auth }) => {
    if (!secret) return null;
    const given = auth.projectorKey;
    const code =
      typeof auth.roomCode === "string"
        ? normalizeRoomCode(auth.roomCode)
        : null;
    if (typeof given !== "string" || !code) return null;
    const db = await getDb();
    const [game] = await db
      .select({ game_id: games.game_id, room_code: games.room_code })
      .from(games)
      .where(eq(games.room_code, code))
      .limit(1);
    if (!game) return null;
    const expected = Buffer.from(projectorKey(secret, game));
    const actual = Buffer.from(given);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }
    return { kind: "projector", gameId: game.game_id };
  };
}
