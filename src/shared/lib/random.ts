/**
 * Seeded randomness shared by every generative module (ADDENDUM-020 §2,
 * ADDENDUM-021 §3.3). Pure, framework-neutral, no DOM.
 */

/** mulberry32: fast 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2-input hash into [0, 1). Used for glitter gates and jitter. */
export function hash01(a: number, b = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Pick a random integer in [0, n) from a crypto-quality source. */
export function randomIndex(n: number, fill: (buf: Uint32Array) => Uint32Array): number {
  const buf = fill(new Uint32Array(1));
  return buf[0] % n;
}
/**
 * Plan spelling from ADDENDUM-022 §0.1: create a seeded PRNG. Implemented by
 * mulberry32, which already existed for the spectacle/lattice engines, so
 * the whole codebase draws from one deterministic generator.
 */
export const createPrng: (seed: number) => () => number = mulberry32;
