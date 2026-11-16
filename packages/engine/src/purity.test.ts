/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Replays only work if the engine takes time and randomness as input.
describe("engine source", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter(
    (f) =>
      f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "test-helpers.ts",
  );

  it("finds the source files", () => {
    expect(files).toContain("reduce.ts");
  });

  for (const file of files) {
    it(`${file} has no clock or Math.random`, () => {
      const code = readFileSync(join(dir, file), "utf8")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toMatch(
        /Date\.now|new Date\(|Math\.random|performance\.now/,
      );
    });
  }
});
