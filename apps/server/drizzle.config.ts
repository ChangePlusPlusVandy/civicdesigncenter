import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env" }); // repo-root .env

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
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
      dbCredentials: { url: "./.pglite" },
    }); //pglite
