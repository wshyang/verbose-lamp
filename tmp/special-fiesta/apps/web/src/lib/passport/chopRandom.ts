/**
 * ADR-241 — the one source of chance a chop may use.
 *
 * `Math.random` is not in this file and is not in anything that imports it. Every draw comes out
 * of a seeded generator, which is what lets a device keep only a number and still reproduce the
 * mark exactly (ADR-240).
 */

export type Random = () => number;

/**
 * mulberry32: a small generator whose sequence depends only on its seed. The reference output
 * for seed 1 is pinned in `chop.test.ts`, because changing the generator redraws every chop.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in `[low, high)`. The order of these calls is part of the recipe, not a detail. */
export function between(random: Random, low: number, high: number): number {
  return low + (high - low) * random();
}

export function pick<T>(random: Random, options: readonly T[]): T {
  return options[Math.floor(random() * options.length)] as T;
}

/** Whether a defect appears at all. One call, so a die's chances cannot drift the whole stream. */
export function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

/** A seed for one of the turbulence filters, which take a whole number. */
export function turbulenceSeed(random: Random): number {
  return 1 + Math.floor(random() * 0xfffe);
}

/** A printed serial, the decoration a stamp carries and nothing depends on. */
export function serialNumber(random: Random, digits: number): string {
  let out = '';
  for (let index = 0; index < digits; index += 1) {
    out += Math.floor(random() * 10).toString();
  }
  return out;
}

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}
