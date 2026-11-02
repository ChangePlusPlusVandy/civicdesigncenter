import { describe, expect, it } from "vitest";
import {
  nextFloat,
  nextInt,
  nextUint32,
  pick,
  seedRng,
  type RngState,
} from "./rng.ts";

function take(state: RngState, n: number): number[] {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    const [value, next] = nextUint32(s);
    out.push(value);
    s = next;
  }
  return out;
}

describe("rng", () => {
  it("repeats the same sequence for the same seed", () => {
    expect(take(seedRng(42), 10)).toEqual(take(seedRng(42), 10));
  });

  it("gives different sequences for different seeds", () => {
    expect(take(seedRng(1), 5)).not.toEqual(take(seedRng(2), 5));
  });

  it("keeps a fixed sequence across releases", () => {
    // Changing the algorithm breaks replays of saved games. Update these only on purpose.
    expect(take(seedRng(42), 3)).toEqual([2581720956, 1925393290, 3661312704]);
  });

  it("carries on identically after a JSON round-trip", () => {
    let state = seedRng(7);
    [, state] = nextUint32(state);
    const restored = JSON.parse(JSON.stringify({ rng: state })).rng as RngState;
    expect(take(restored, 5)).toEqual(take(state, 5));
  });

  it("normalizes seeds to uint32 and rejects non-integers", () => {
    expect(seedRng(-1)).toBe(2 ** 32 - 1);
    expect(() => seedRng(1.5)).toThrow(RangeError);
    expect(() => seedRng(Number.NaN)).toThrow(RangeError);
  });

  it("returns floats in [0, 1)", () => {
    let s = seedRng(3);
    for (let i = 0; i < 1000; i++) {
      const [value, next] = nextFloat(s);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      s = next;
    }
  });

  it("returns ints in [0, bound) and hits every value", () => {
    let s = seedRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const [value, next] = nextInt(s, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
      s = next;
    }
    expect(seen.size).toBe(6);
  });

  it("rejects bad bounds", () => {
    expect(() => nextInt(seedRng(0), 0)).toThrow(RangeError);
    expect(() => nextInt(seedRng(0), 2.5)).toThrow(RangeError);
  });

  it("picks an element and refuses an empty list", () => {
    const [item] = pick(seedRng(5), ["clay", "copper", "food", "lumber"]);
    expect(["clay", "copper", "food", "lumber"]).toContain(item);
    expect(() => pick(seedRng(5), [])).toThrow(RangeError);
  });
});
