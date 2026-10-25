// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { SIGNATURE_GENOME, clampGene, clampGenome, GENE_DEFINITIONS, GENE_ORDER, isSignatureGenome, withGene } from './genome';

/**
 * The genome is the frame's proportion dial. `clampGene` is the only writer, so its
 * answer for nonsense input decides what the UI shows after a bad slider value.
 */
describe('clampGene', () => {
  it('falls back to the signature value when the input is not a number', () => {
    for (const key of GENE_ORDER) {
      expect(clampGene(key, Number.NaN)).toBe(GENE_DEFINITIONS[key].signature);
      expect(clampGene(key, Number.POSITIVE_INFINITY)).toBe(GENE_DEFINITIONS[key].signature);
    }
  });
});
describe('clampGenome and withGene', () => {
  it('fills every gene, so a partial candidate is always usable', () => {
    const genome = clampGenome({});

    expect(Object.keys(genome).sort()).toEqual([...GENE_ORDER].sort());
    expect(genome).toEqual({ ...SIGNATURE_GENOME });
    expect(isSignatureGenome(genome)).toBe(true);
  });

  it('clamps each supplied gene and forgets the ones it was not given', () => {
    const key = GENE_ORDER[0];
    const definition = GENE_DEFINITIONS[key];

    const genome = clampGenome({ [key]: definition.max + 50 });

    expect(genome[key]).toBe(definition.max);
    expect(isSignatureGenome(genome)).toBe(false);
    expect(isSignatureGenome(withGene(genome, key, definition.signature))).toBe(true);
  });
});
