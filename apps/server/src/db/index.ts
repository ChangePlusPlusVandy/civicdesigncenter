import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import * as schema from "./drizzle-schema";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) }); // repo-root .env

const url = process.env.DATABASE_URL;

export const db = url
  ? drizzlePg({ client: new Pool({ connectionString: url }), schema }) //pg
  : drizzlePglite({ client: new PGlite("./.pglite"), schema }); //pglite
