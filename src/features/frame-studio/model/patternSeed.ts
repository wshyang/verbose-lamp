/**
 * Deterministic pattern seeds for the Deco Lattice reroll (ADDENDUM-026).
 * Pure: extracted from `useFrameStudio` so the arithmetic is unit-testable without
 * rendering the hook. Deterministic on purpose: the same current seed always gives
 * the same next one, so a reroll sequence can be replayed and asserted exactly.
 */
export const LATTICE_DEFAULT_SEED = 1925;

const LCG_MULTIPLIER = 9301;
const LCG_INCREMENT = 49297;
const LCG_MODULUS = 233280;

/** Deterministic next seed for the pattern reroll (no Math.random). */
export function nextPatternSeed(seed: number | undefined): number {
  return ((seed ?? LATTICE_DEFAULT_SEED) * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
}
