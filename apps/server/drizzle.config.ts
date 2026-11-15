import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

config({ path: "../../.env" }); // repo-root .env

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
// Same folder as src/db/index.ts, so migrations and the server always use one database
const pglitePath = fileURLToPath(new URL("./.pglite", import.meta.url));
const base = {
  out: "./drizzle",
  schema: "./src/db/drizzle-schema.ts",
  dialect: "postgresql",
} as const;

export default url
  ? defineConfig({ ...base, dbCredentials: { url } }) //pg
  : defineConfig({
      ...base,
      driver: "pglite",
      dbCredentials: { url: pglitePath },
    }); //pglite
