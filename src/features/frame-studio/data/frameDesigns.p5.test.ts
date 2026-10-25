// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { GENE_DEFINITIONS, SIGNATURE_GENOME, withGene, type GeneKey } from '@/features/art-deco-frame';

import { DESIGN_GALLERY, describeDesign, formatGeneValue, signatureMarkerPercent } from './frameDesigns';

describe('describeDesign', () => {
  it('names gallery entries, calling out the original', () => {
    expect(describeDesign(DESIGN_GALLERY[0], SIGNATURE_GENOME)).toBe('Original');
    const named = DESIGN_GALLERY[1];
    expect(describeDesign(named, named.genome)).toBe(named.label);
    const variation = DESIGN_GALLERY.find((entry) => entry.kind === 'variation') as (typeof DESIGN_GALLERY)[number];
    expect(describeDesign(variation, variation.genome)).toBe(variation.label);
  });

  it('falls back to Original or Custom from the genome when no entry matches', () => {
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, withGene(SIGNATURE_GENOME, 'rayDensity', 1.4))).toBe('Custom');
  });
});
describe('formatGeneValue', () => {
  it('words the corner profile', () => {
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', 0.5)).toBe('Rounded 50%');
    expect(formatGeneValue('cornerProfile', -0.25)).toBe('Notched 25%');
  });

  it('counts stairs and wings with their plurals', () => {
    expect(formatGeneValue('zigguratSteps', 1)).toBe('1 stair');
    expect(formatGeneValue('zigguratSteps', 3)).toBe('3 stairs');
    expect(formatGeneValue('wingDelta', 0)).toBe('±0 wings');
    expect(formatGeneValue('wingDelta', 1)).toBe('+1 wing');
    expect(formatGeneValue('wingDelta', 2)).toBe('+2 wings');
    expect(formatGeneValue('wingDelta', -1)).toBe('−1 wing');
    expect(formatGeneValue('wingDelta', -2)).toBe('−2 wings');
  });

  it('words recursion and plain multipliers', () => {
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
    expect(formatGeneValue('fractalDepth', 2)).toBe('Depth 2');
    expect(formatGeneValue('fractalRatio', 0.4)).toBe('r = 0.40');
    expect(formatGeneValue('rayDensity', 1.2)).toBe('×1.20');
  });
});
describe('signature markers', () => {
  it('places every signature tick inside its slider, recursion at the rest end', () => {
    expect(signatureMarkerPercent('fractalDepth')).toBe(0);
    for (const key of Object.keys(GENE_DEFINITIONS) as GeneKey[]) {
      const percent = signatureMarkerPercent(key);
      expect(percent, key).toBeGreaterThanOrEqual(0);
      expect(percent, key).toBeLessThanOrEqual(100);
    }
  });
});
