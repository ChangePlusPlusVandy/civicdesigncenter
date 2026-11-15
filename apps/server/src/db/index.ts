import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { config } from "dotenv";
import * as schema from "./drizzle-schema";
import { dbPaths } from "./paths";

// Resolved by walking up to the package and repo roots, so source and the tsup bundle (dist/) find the same
//   files, and running from another folder cannot create a second, unmigrated database (ARCH-051)
const paths = dbPaths(import.meta.url);
if (paths.env) config({ path: paths.env }); // repo-root .env; a deployed image uses its environment

const url = process.env.DATABASE_URL;

export const db = url
  ? drizzlePg({ client: new Pool({ connectionString: url }), schema }) //pg
  : drizzlePglite({ client: new PGlite(paths.pglite), schema }); //pglite
