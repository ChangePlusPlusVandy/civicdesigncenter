// TEMPORARY walking-skeleton game creation (#19, ARCH-063) until the
// facilitator console and player join exist (#24, #36). `POST /api/demo/games`
// with `Authorization: Bearer <DEMO_SECRET>` creates a game of the default
// scenario with one seat per city, its snapshot at version 0, and returns
// the seat tokens and the projector key. Disabled unless DEMO_SECRET is set.

import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import express, { type Router } from "express";
import { createInitialState, reduce } from "@cs/engine";
import type { GameState } from "@cs/engine";
import type { DemoGameResponse, Scenario } from "@cs/shared";
import { games, players, snapshots, teams } from "../db/drizzle-schema.ts";
import { hashToken } from "../db/tokens.ts";
import type { Db } from "../realtime/index.ts";
import { errorKind } from "../realtime/index.ts";
import { projectorKey } from "./projector.ts";
import { DEFAULT_SCENARIO_ID, getScenario } from "./scenarios.ts";

// No 0/O or 1/I, so a code read off the projector is typed right.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6; // REQ-010: 4–8 characters [A-Z0-9]

const randomCode = () =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");

// Creates the game, its teams and seats, and the snapshot every game needs
// before a client connects (ARCH-021, ARCH-052). One transaction, so a
// failure leaves nothing behind.
export async function createDemoGame(
  db: Db,
  projectorSecret: string,
  scenarioId = DEFAULT_SCENARIO_ID,
): Promise<DemoGameResponse> {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error("UNKNOWN_SCENARIO");
  const seed = randomInt(2 ** 32); // uint32 (EVENTS §5.1)

  return db.transaction(async (tx) => {
    const [game] = await tx
      .insert(games)
      .values({
        scenario_id: scenario.id,
        room_code: randomCode(),
        rng_seed: seed,
        phase: "auction", // started below, so gifts are allowed
      })
      .returning({ game_id: games.game_id, room_code: games.room_code });
    if (!game) throw new Error("NO_GAME_ROW");

    const seats: DemoGameResponse["seats"] = [];
    for (const city of scenario.cities) {
      const [team] = await tx
        .insert(teams)
        .values({
          game_id: game.game_id,
          name: city.name.slice(0, 20),
          city_key: city.id, // ARCH-017
        })
        .returning({ team_id: teams.team_id });
      if (!team) throw new Error("NO_TEAM_ROW");
      const token = randomBytes(24).toString("base64url");
      await tx.insert(players).values({
        game_id: game.game_id,
        team_id: team.team_id,
        // A fixed seat label, not a person's name (EVT-008).
        username: `seat-${city.id}`,
        token_hash: hashToken(token), // ARCH-030: only the hash is stored
      });
      seats.push({ cityId: city.id, cityName: city.name, token });
    }

    await tx.insert(snapshots).values({
      game_id: game.game_id,
      version: 0,
      state: startedState(scenario, seed),
    });

    return {
      roomCode: game.room_code,
      projectorKey: projectorKey(projectorSecret, game),
      seats,
    };
  });
}

// The demo has no facilitator yet, so the game starts running: the lobby
// does not allow gifts (GAME-RULES §3).
function startedState(scenario: Scenario, seed: number): GameState {
  const result = reduce(scenario, createInitialState(scenario, seed), {
    type: "startGame",
    payload: {},
    actor: { kind: "teacher", teacherId: "demo" },
    at: Date.now(),
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}

// Constant-time bearer check; hashing first makes the lengths equal.
function bearerMatches(header: string | undefined, secret: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return given.length > 0 && timingSafeEqual(digest(given), digest(secret));
}

export function demoRouter(options: {
  getDb: () => Promise<Db> | Db;
  demoSecret: string;
  projectorSecret: string;
}): Router {
  const router = express.Router();
  router.post("/games", async (req, res) => {
    if (!bearerMatches(req.headers.authorization, options.demoSecret)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const body = await createDemoGame(
        await options.getDb(),
        options.projectorSecret,
      );
      res.status(201).json(body);
    } catch (error) {
      console.error("demo game creation failed:", errorKind(error));
      res.status(500).json({ error: "internal" });
    }
  });
  return router;
}
