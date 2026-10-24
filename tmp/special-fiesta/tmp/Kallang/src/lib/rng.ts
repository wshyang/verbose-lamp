/** Deterministic seeded RNG (CLAUDE §12.4): same seed -> same scene. */

export interface Rng {
  next: () => number;
  range: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0 || 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    pick: (items) => {
      const picked = items[Math.floor(next() * items.length)];
      if (picked === undefined) throw new Error("pick() from empty list");
      return picked;
    },
  };
}
