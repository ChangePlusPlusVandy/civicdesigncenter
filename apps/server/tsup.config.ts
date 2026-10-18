import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Workspace packages export TypeScript source, so bundle them into the output.
  noExternal: [/^@cs\//],
});
