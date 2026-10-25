// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { SIGNATURE_GENOME, clampGene, clampGenome } from './genome';

describe('clampGene', () => {
  it('clamps continuous and integral genes to their ranges', () => {
    expect(clampGene('rayReach', 99)).toBe(1.35);
    expect(clampGene('rayReach', -99)).toBe(0.75);
    expect(clampGene('zigguratSteps', 2.4)).toBe(2);
    expect(clampGene('raySpread', 1)).toBe(1);
  });

  it('falls back to the signature gene for a non-finite value', () => {
    expect(clampGene('rayReach', Number.NaN)).toBe(SIGNATURE_GENOME.rayReach);
    expect(clampGene('zigguratSteps', Number.NEGATIVE_INFINITY)).toBe(SIGNATURE_GENOME.zigguratSteps);
  });
});
describe('clampGenome', () => {
  it('fills missing genes from the signature', () => {
    const genome = clampGenome({ rayDensity: 2 });
    expect(genome.rayDensity).toBe(1.6);
    expect(genome.raySpread).toBe(SIGNATURE_GENOME.raySpread);
    expect(Object.keys(genome)).toHaveLength(Object.keys(SIGNATURE_GENOME).length);
  });
});
