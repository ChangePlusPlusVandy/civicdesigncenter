// Pure, deterministic game rules. No I/O, no Math.random, no Date.now.
// See docs/ARCHITECTURE.md.

export const ENGINE_VERSION = "0.0.0";

export { reduce } from "./reduce.ts";
export { project } from "./project.ts";
export type {
  PlayerProjection,
  ProjectorProjection,
  Projection,
  TeacherProjection,
  TeamProjection,
} from "./project.ts";
export { createInitialState } from "./state.ts";
export { nextFloat, nextInt, nextUint32, pick, seedRng } from "./rng.ts";
export type { RngState } from "./rng.ts";
export type * from "./types.ts";
export {
  adjacentFeatureIds,
  buildMap,
  inBounds,
  isOnPlot,
  isVisibleTo,
  neighbours,
  tileAt,
  visibleTiles,
} from "./map.ts";
export type { GameMap, Pos, Tile } from "./map.ts";
