import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

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

const app = createApp({ webDist: isProduction ? webDist : undefined });

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
