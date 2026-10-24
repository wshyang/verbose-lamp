/**
 * Deterministic gold-leaf flecks: hashed value noise on an integer lattice. The same
 * input always gives the same output on every machine, so renders can be snapshotted.
 */

function hashLattice(x: number, y: number, seed: number): number {
  let hash = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

/** Smooth value noise in [0, 1). */
export function leafAt(x: number, y: number, seed: number): number {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const fx = smooth(x - left);
  const fy = smooth(y - top);
  const upper = lerp(hashLattice(left, top, seed), hashLattice(left + 1, top, seed), fx);
  const lower = lerp(hashLattice(left, top + 1, seed), hashLattice(left + 1, top + 1, seed), fx);
  return lerp(upper, lower, fy);
}

/** The 1925 seed is arbitrary but fixed: the year the novel was published. */
export const LEAF_SEED = 1925;

/**
 * Fleck strength 0–1 at a unit-space point. Two octaves give torn-leaf edges; density
 * lowers the threshold so more of the noise surface becomes gold.
 */
export function fleckAt(point: { u: number; v: number }, density: number, seed = LEAF_SEED): number {
  if (density <= 0) return 0;
  const noise = 0.65 * leafAt(point.u * 46, point.v * 46, seed) + 0.35 * leafAt(point.u * 97, point.v * 97, seed + 7);
  const threshold = 1 - Math.min(1, density) * 0.5;
  const amount = (noise - threshold) / 0.05;
  return Math.min(1, Math.max(0, amount));
}
