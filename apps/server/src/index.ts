import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { Sandbox } from "./sandbox/index.ts";
import { openStore } from "./sandbox/store.ts";
import {
  anyOf,
  playerTokenAuth,
  Realtime,
  snapshotLoader,
} from "./realtime/index.ts";
import { demoRouter } from "./game/demo.ts";
import { actionPipeline } from "./game/pipeline.ts";
import { projectorKeyAuth } from "./game/projector.ts";

// Load the repo-root .env if present (local dev). Deployed environments set real env vars.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env file: rely on the environment.
}

const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

// From apps/server/{src,dist}/index.* to apps/web/dist.
const webDist =
  process.env.WEB_DIST ??
  fileURLToPath(new URL("../../web/dist", import.meta.url));

// Games are saved to Postgres when DATABASE_URL is set (Neon in staging),
// otherwise to a local PGlite folder, and come back after a restart. The
// container's default folder isn't writable, so production needs a database
// or a folder chosen on purpose (the e2e tests use one).
if (
  isProduction &&
  !process.env.DATABASE_URL &&
  !process.env.SANDBOX_PGLITE_DIR
) {
  console.error(
    "Set DATABASE_URL (or SANDBOX_PGLITE_DIR to a writable folder) when NODE_ENV=production.",
  );
  process.exit(1);
}
const sandbox = await Sandbox.open({
  store: await openStore(
    process.env.DATABASE_URL || undefined,
    process.env.SANDBOX_PGLITE_DIR || undefined,
  ),
});
// Opened on first use, so a server that only runs the sandbox never opens the
// main game's database. Teacher sign-in arrives with #24.
const getDb = () => import("./db/index.ts").then((m) => m.db);

// TEMPORARY until #24: projector keys are signed with SESSION_SECRET
// (ARCH-036), and DEMO_SECRET enables demo game creation (ARCH-063). The
// example value of SESSION_SECRET is the development default and is refused
// in production.
const DEV_SESSION_SECRET = "dev-only-change-me"; // .env.example
const sessionSecret = process.env.SESSION_SECRET || undefined;
const projectorSecret = isProduction
  ? sessionSecret === DEV_SESSION_SECRET
    ? undefined
    : sessionSecret
  : (sessionSecret ?? DEV_SESSION_SECRET);
const demoSecret = process.env.DEMO_SECRET || undefined;
const demo =
  demoSecret && projectorSecret
    ? demoRouter({ getDb, demoSecret, projectorSecret })
    : undefined;

const app = createApp({
  webDist: isProduction ? webDist : undefined,
  sandbox,
  demo,
});
const server = createServer(app);
// One Socket.IO server: the sandbox on /sandbox, the main game on / (ARCH-020).
const io = sandbox.attach(server);
export const realtime: Realtime = new Realtime(io, {
  authenticate: anyOf(
    playerTokenAuth(getDb),
    projectorKeyAuth(getDb, projectorSecret),
  ),
  loadSnapshot: snapshotLoader(getDb),
  onAction: actionPipeline({
    getDb,
    broadcast: (gameId, state, version) =>
      realtime.broadcast(gameId, state, version),
  }),
});

server.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});

// Save every game before the process stops (deploys send SIGTERM).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sandbox.close().finally(() => process.exit(0));
  });
}
