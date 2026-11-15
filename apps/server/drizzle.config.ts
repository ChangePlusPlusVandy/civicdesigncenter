import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

// repo-root .env, resolved from this file so it loads whatever folder drizzle-kit runs from
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
// Same folder as src/db/index.ts, so migrations and the server always use one database
const pglitePath = fileURLToPath(new URL("./.pglite", import.meta.url));
const base = {
  out: "./drizzle",
  schema: "./src/db/drizzle-schema.ts",
  dialect: "postgresql",
  // ARCH-091: the idle-builder sandbox creates its own sandbox_* tables in the same database
  //   (apps/server/src/sandbox/store.ts). Hide them from drizzle-kit so push and studio never drop or alter them.
  tablesFilter: ["!sandbox_*"] as string[],
} as const;

export default url
  ? defineConfig({ ...base, dbCredentials: { url } }) //pg
  : defineConfig({
      ...base,
      driver: "pglite",
      dbCredentials: { url: pglitePath },
    }); //pglite
