import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME } from '../../art-deco-frame';
import { DESIGN_GALLERY, describeDesign, formatGeneValue } from './frameDesigns';

describe('frame design descriptions', () => {
  it('labels original, named, signature-fallback, and custom genomes', () => {
    expect(describeDesign(DESIGN_GALLERY[0], SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(DESIGN_GALLERY[1], DESIGN_GALLERY[1].genome)).toBe(DESIGN_GALLERY[1].label);
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, { ...SIGNATURE_GENOME, cornerScale: 1.7 })).toBe('Custom');
  });
});

describe('formatGeneValue', () => {
  it('formats every gene family and singular/plural edge', () => {
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', 0.456)).toBe('Rounded 46%');
    expect(formatGeneValue('cornerProfile', -0.456)).toBe('Notched 46%');
    expect(formatGeneValue('zigguratSteps', 1)).toBe('1 stair');
    expect(formatGeneValue('zigguratSteps', -1)).toBe('-1 stair');
    expect(formatGeneValue('zigguratSteps', 3)).toBe('3 stairs');
    expect(formatGeneValue('wingDelta', 0)).toBe('±0 wings');
    expect(formatGeneValue('wingDelta', 1)).toBe('+1 wing');
    expect(formatGeneValue('wingDelta', 2)).toBe('+2 wings');
    expect(formatGeneValue('wingDelta', -1)).toBe('−1 wing');
    expect(formatGeneValue('wingDelta', -2)).toBe('−2 wings');
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
    expect(formatGeneValue('fractalDepth', 2)).toBe('Depth 2');
    expect(formatGeneValue('fractalRatio', 0.456)).toBe('r = 0.46');
    expect(formatGeneValue('rayDensity', 1.234)).toBe('×1.23');
  });
});
