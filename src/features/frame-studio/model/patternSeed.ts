/**
 * Deterministic pattern seeds for the Deco Lattice reroll (ADDENDUM-026).
 * Pure: extracted from `useFrameStudio` so the arithmetic is unit-testable
 * without rendering the hook (ADDENDUM-029).
 */
export const LATTICE_DEFAULT_SEED = 1925;

/** Deterministic next seed for the pattern reroll (no Math.random). */
export function nextPatternSeed(seed: number | undefined): number {
  return ((seed ?? LATTICE_DEFAULT_SEED) * 9301 + 49297) % 233280;
}
