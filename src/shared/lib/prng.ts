import { mulberry32 } from './random';

/**
 * Seeded PRNG factory (ADDENDUM-022 §0.1). The stream is the shared
 * mulberry32 from `./random` (ADDENDUM-020/021), named as a factory so
 * call sites read as "create a deterministic stream for this artefact".
 */
export function createPrng(seed: number): () => number {
  return mulberry32(seed);
}
