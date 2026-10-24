/**
 * ADR-350 — the one seeded random (moved here from the crowd on its second copy, ADR-073's rule).
 *
 * Every synthetic actor in this repository — a browser extra in the crowd (ADR-348) or a
 * protocol user in the load tier (ADR-350) — must behave reproducibly: actor #k's think-times
 * and choices are the same in every run, so a smaller run is an exact prefix of a bigger one
 * and two runs can be compared line by line. Lehmer's generator needs no bitwise tricks, and
 * `seedFrom` turns any string (a run id) plus an actor number into a stable seed.
 */

/** Lehmer RNG: small, dependency-free, and reproducible across Node versions. */
export function lehmer(seed: number): () => number {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

/**
 * A stable, DECORRELATED number for (text, n). Lehmer is affine in its seed, so seeding with
 * consecutive actor numbers (user 41, user 42, …) would make every actor draw the same first
 * number — a clone army, which the load tier's spread test caught in the wild. Instead the
 * text is hashed to a base generator and actor #n gets its n-th OUTPUT: consecutive actors
 * map to consecutive draws of a good generator, which is exactly the spread we want.
 */
export function seedFrom(text: string, n: number): number {
  let hash = 7;
  for (const ch of text) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 2_147_483_647;
  }
  const base = lehmer(hash);
  let out = 0;
  for (let i = 0; i < n; i += 1) {
    out = Math.floor(base() * 2_147_483_647);
  }
  return out;
}
