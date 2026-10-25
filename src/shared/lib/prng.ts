import { mulberry32 } from './random';

/**
 * Seeded PRNG factory for deterministic scene fields (ADDENDUM-027 §2).
 * Wraps the one mulberry32 implementation in `random.ts`, so every generative
 * surface in the repo draws from the same stream definition.
 */
export const DUST_SEED = 1920;

export function createPrng(seed: number): () => number {
  return mulberry32(seed);
}
