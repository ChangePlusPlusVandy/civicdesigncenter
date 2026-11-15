import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.ts"],
    // Several server test files boot their own PGlite and run migrations in
    // parallel, which can pass the 5 s / 10 s defaults on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
