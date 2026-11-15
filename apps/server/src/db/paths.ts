// Finds the server package root and the repo root by walking up from a module, so the paths below are the same
//   whether the code runs from source (src/db/index.ts) or bundled by tsup (dist/index.js) (ARCH-051)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = { name?: string; workspaces?: unknown };

function readPackage(dir: string): PackageJson | undefined {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

// Nearest directory at or above `from` whose package.json matches, or undefined at the filesystem root
export function findUp(
  from: string,
  matches: (pkg: PackageJson) => boolean,
): string | undefined {
  let dir = from;
  for (;;) {
    const pkg = readPackage(dir);
    if (pkg && matches(pkg)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface DbPaths {
  pglite: string; // apps/server/.pglite (ARCH-051)
  env: string | undefined; // repo-root .env, undefined when there is no repo root (a deployed image)
}

// `moduleUrl` is the caller's import.meta.url. Falls back to the working directory when the server package
//   cannot be found, so a stripped-down deploy still starts (production uses DATABASE_URL anyway)
export function dbPaths(moduleUrl: string, cwd = process.cwd()): DbPaths {
  const start = dirname(fileURLToPath(moduleUrl));
  const server = findUp(start, (p) => p.name === "@cs/server") ?? cwd;
  const repo = findUp(start, (p) => Array.isArray(p.workspaces));
  return {
    pglite: join(server, ".pglite"),
    env: repo ? join(repo, ".env") : undefined,
  };
}
