// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { SIGNATURE_GENOME, withGene } from '@/features/art-deco-frame';

import { DESIGN_GALLERY, describeDesign, designAt, findDesignEntry, formatGeneValue, isGeneAtSignature, signatureMarkerPercent } from './frameDesigns';

describe('designAt', () => {
  it('walks the gallery and wraps in both directions', () => {
    expect(designAt(0)).toBe(DESIGN_GALLERY[0]);
    expect(designAt(2)).toBe(DESIGN_GALLERY[2]);
    expect(designAt(DESIGN_GALLERY.length)).toBe(DESIGN_GALLERY[0]);
    expect(designAt(-1)).toBe(DESIGN_GALLERY[DESIGN_GALLERY.length - 1]);
    expect(designAt(-(DESIGN_GALLERY.length + 1))).toBe(DESIGN_GALLERY[DESIGN_GALLERY.length - 1]);
    expect(designAt(1.4)).toBe(DESIGN_GALLERY[1]);
  });
});
describe('findDesignEntry', () => {
  it('finds the original by its exact genome', () => {
    expect(findDesignEntry(SIGNATURE_GENOME)?.label).toBe('Original');
  });

  it('returns nothing for a custom genome', () => {
    expect(findDesignEntry(withGene(SIGNATURE_GENOME, 'rayDensity', 1.42))).toBeUndefined();
  });

  it('clamps before comparing, so an out-of-range value never matches a design', () => {
    // 99 clamps to the slider maximum (1.6), which no gallery genome uses.
    expect(findDesignEntry(withGene(SIGNATURE_GENOME, 'rayDensity', 99))).toBeUndefined();
  });
});
describe('describeDesign', () => {
  it('names the original, a named design and a variation', () => {
    const [original, named, , variation] = [
      DESIGN_GALLERY[0],
      DESIGN_GALLERY[1],
      DESIGN_GALLERY[2],
      DESIGN_GALLERY[DESIGN_GALLERY.length - 1],
    ];
    expect(describeDesign(original, original.genome)).toBe('Original');
    expect(describeDesign(named, named.genome)).toBe(named.label);
    expect(describeDesign(variation, variation.genome)).toBe(variation.label);
  });

  it('describes an unmatched genome by whether it is still the signature', () => {
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, withGene(SIGNATURE_GENOME, 'wingDelta', 2))).toBe('Custom');
  });
});
describe('formatGeneValue', () => {
  it('prints corners in words and percentages', () => {
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', 0.25)).toBe('Rounded 25%');
    expect(formatGeneValue('cornerProfile', -0.25)).toBe('Notched 25%');
  });

  it('pluralises stairs and wings', () => {
    expect(formatGeneValue('zigguratSteps', 1)).toBe('1 stair');
    expect(formatGeneValue('zigguratSteps', 3)).toBe('3 stairs');
    expect(formatGeneValue('wingDelta', 0)).toBe('±0 wings');
    expect(formatGeneValue('wingDelta', 1)).toBe('+1 wing');
    expect(formatGeneValue('wingDelta', -2)).toBe('−2 wings');
  });

  it('prints recursion depth and ratio, and falls back for plain genes', () => {
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
    expect(formatGeneValue('fractalDepth', 3)).toBe('Depth 3');
    expect(formatGeneValue('fractalRatio', 0.5)).toBe('r = 0.50');
    expect(formatGeneValue('rayDensity', 1.25)).toBe('×1.25');
  });
});
describe('signature marks', () => {
  it('knows the signature value and its slider position', () => {
    expect(isGeneAtSignature('rayDensity', SIGNATURE_GENOME.rayDensity)).toBe(true);
    expect(isGeneAtSignature('rayDensity', SIGNATURE_GENOME.rayDensity + 0.1)).toBe(false);
    const percent = signatureMarkerPercent('cornerScale');
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });
});
