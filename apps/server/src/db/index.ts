import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import * as schema from "./drizzle-schema";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) }); // repo-root .env

const url = process.env.DATABASE_URL;
// apps/server/.pglite wherever the process starts, so running from another folder cannot create a second, unmigrated database
const pglitePath = fileURLToPath(new URL("../../.pglite", import.meta.url));

export const db = url
  ? drizzlePg({ client: new Pool({ connectionString: url }), schema }) //pg
  : drizzlePglite({ client: new PGlite(pglitePath), schema }); //pglite
