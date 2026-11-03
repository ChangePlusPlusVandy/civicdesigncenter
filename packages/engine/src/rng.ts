// Seeded random numbers whose whole state is one uint32, so it lives in
// GameState and survives a JSON snapshot. Every function is pure: it takes the
// current state and returns [value, nextState]. The engine must use this and
// never Math.random().
//
// Algorithm: mulberry32. A 2^32 period is plenty for a classroom game.

export type RngState = number;

// The seed is the state, so a seed outside [0, 2^32) is refused rather than
// wrapped: the seed a server logs is always the seed the game stores.
export function seedRng(seed: number): RngState {
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) {
    throw new RangeError(`seed must be an integer in [0, 2^32), got ${seed}`);
  }
  return seed;
}

// A uniform integer in [0, 2^32).
export function nextUint32(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  return [(t ^ (t >>> 14)) >>> 0, next];
}

// A uniform number in [0, 1).
export function nextFloat(state: RngState): [number, RngState] {
  const [value, next] = nextUint32(state);
  return [value / 2 ** 32, next];
}

// A uniform integer in [0, bound). Rejects the top sliver of the uint32 range
// so small bounds are not biased.
export function nextInt(state: RngState, bound: number): [number, RngState] {
  if (!Number.isInteger(bound) || bound < 1 || bound > 2 ** 32) {
    throw new RangeError(`bound must be an integer in [1, 2^32], got ${bound}`);
  }
  const limit = 2 ** 32 - (2 ** 32 % bound);
  let current = state;
  for (;;) {
    const [value, next] = nextUint32(current);
    current = next;
    if (value < limit) return [value % bound, current];
  }
}

// A uniformly chosen element of a non-empty list.
export function pick<T>(state: RngState, items: readonly T[]): [T, RngState] {
  if (items.length === 0) {
    throw new RangeError("cannot pick from an empty list");
  }
  const [index, next] = nextInt(state, items.length);
  return [items[index] as T, next];
}
