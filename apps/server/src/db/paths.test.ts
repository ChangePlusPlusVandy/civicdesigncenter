// ARCH-051: the PGlite folder and .env resolve the same from source and from the tsup bundle
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { dbPaths } from "./paths";

const root = mkdtempSync(join(tmpdir(), "db-paths-"));
const server = join(root, "apps", "server");
mkdirSync(join(server, "src", "db"), { recursive: true });
mkdirSync(join(server, "dist"), { recursive: true });
writeFileSync(
  join(root, "package.json"),
  JSON.stringify({ name: "repo", workspaces: ["apps/*"] }),
);
writeFileSync(
  join(server, "package.json"),
  JSON.stringify({ name: "@cs/server" }),
);

const here = fileURLToPath(new URL(".", import.meta.url));
const url = (...parts: string[]) => pathToFileURL(join(...parts)).href;

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("dbPaths", () => {
  test("source and bundle resolve to the same folders", () => {
    const fromSource = dbPaths(url(server, "src", "db", "index.ts"));
    const fromBundle = dbPaths(url(server, "dist", "index.js"));
    expect(fromSource).toEqual({
      pglite: join(server, ".pglite"),
      env: join(root, ".env"),
    });
    expect(fromBundle).toEqual(fromSource);
  });

  test("outside a repo: no .env, PGlite in the working directory", () => {
    const bare = mkdtempSync(join(tmpdir(), "db-paths-bare-"));
    try {
      expect(dbPaths(url(bare, "index.js"), "/srv/app")).toEqual({
        pglite: join("/srv/app", ".pglite"),
        env: undefined,
      });
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("this repo resolves to apps/server/.pglite", () => {
    const paths = dbPaths(url(here, "index.ts"));
    expect(paths.pglite).toBe(join(here, "..", "..", ".pglite"));
    expect(paths.env).toBe(join(here, "..", "..", "..", "..", ".env"));
  });
});
