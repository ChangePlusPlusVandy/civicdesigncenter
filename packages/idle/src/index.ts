// @cs/idle: the idle-builder prototype's rules. Pure and deterministic, no
// I/O. See docs/IDLE-PROTOTYPE.md.

export * from "./content.ts";
export * from "./economy.ts";
export * from "./map.ts";
export * from "./projection.ts";
export * from "./protocol.ts";
export { createGame, reduce, snapshot } from "./rules.ts";
export type * from "./types.ts";
