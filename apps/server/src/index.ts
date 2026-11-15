import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { Sandbox } from "./sandbox/index.ts";
import { openStore } from "./sandbox/store.ts";

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
const app = createApp({ webDist: isProduction ? webDist : undefined, sandbox });
const server = createServer(app);
sandbox.attach(server);

server.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});

// Save every game before the process stops (deploys send SIGTERM).
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void sandbox.close().finally(() => process.exit(0));
  });
}
