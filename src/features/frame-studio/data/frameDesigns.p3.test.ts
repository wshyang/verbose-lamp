// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { GENE_DEFINITIONS, SIGNATURE_GENOME } from '@/features/art-deco-frame';

import { DESIGN_GALLERY, GENE_GROUPS, GENE_UI, VARIATION_COUNT, describeDesign, designAt, findDesignEntry, formatGeneValue, isGeneAtSignature, signatureMarkerPercent } from './frameDesigns';

describe('DESIGN_GALLERY', () => {
  it('starts with the original and lists every named design and variation', () => {
    expect(DESIGN_GALLERY[0]).toMatchObject({ index: 0, label: 'Original', kind: 'original' });
    expect(DESIGN_GALLERY.filter((entry) => entry.kind === 'variation')).toHaveLength(VARIATION_COUNT);
    expect(DESIGN_GALLERY.map((entry) => entry.index)).toEqual(
      DESIGN_GALLERY.map((_, position) => position),
    );
  });

  it('groups every gene exactly once', () => {
    const grouped = GENE_GROUPS.flatMap((group) => group.genes);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(Object.keys(GENE_UI).sort()).toEqual([...grouped].sort());
  });
});
describe('designAt', () => {
  it('clamps an index into the gallery by wrapping', () => {
    expect(designAt(2).index).toBe(2);
    expect(designAt(DESIGN_GALLERY.length).index).toBe(0);
    expect(designAt(-1).index).toBe(DESIGN_GALLERY.length - 1);
    expect(designAt(1.4).index).toBe(1);
  });
});
describe('findDesignEntry', () => {
  it('finds the entry whose genome matches, after clamping', () => {
    expect(findDesignEntry(SIGNATURE_GENOME)?.label).toBe('Original');
    expect(findDesignEntry(DESIGN_GALLERY[2].genome)?.label).toBe(DESIGN_GALLERY[2].label);
  });

  it('returns undefined for a genome no design owns', () => {
    expect(findDesignEntry({ ...SIGNATURE_GENOME, wingSweep: 0.61 })).toBeUndefined();
  });
});
describe('describeDesign', () => {
  it('names the original, a named design and a custom genome', () => {
    expect(describeDesign(DESIGN_GALLERY[0], SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(DESIGN_GALLERY[1], DESIGN_GALLERY[1].genome)).toBe(DESIGN_GALLERY[1].label);
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, { ...SIGNATURE_GENOME, wingSweep: 0.61 })).toBe('Custom');
  });
});
describe('formatGeneValue', () => {
  it('reads every gene family in plain language', () => {
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', 0.5)).toBe('Rounded 50%');
    expect(formatGeneValue('cornerProfile', -0.25)).toBe('Notched 25%');
    expect(formatGeneValue('zigguratSteps', 1)).toBe('1 stair');
    expect(formatGeneValue('zigguratSteps', 3)).toBe('3 stairs');
    expect(formatGeneValue('wingDelta', 0)).toBe('±0 wings');
    expect(formatGeneValue('wingDelta', 1)).toBe('+1 wing');
    expect(formatGeneValue('wingDelta', -2)).toBe('−2 wings');
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
    expect(formatGeneValue('fractalDepth', 2)).toBe('Depth 2');
    expect(formatGeneValue('fractalRatio', 0.5)).toBe('r = 0.50');
    expect(formatGeneValue('rayDensity', 1.25)).toBe('×1.25');
  });
});
describe('isGeneAtSignature', () => {
  it('is true only at the signature value', () => {
    expect(isGeneAtSignature('rayDensity', SIGNATURE_GENOME.rayDensity)).toBe(true);
    expect(isGeneAtSignature('rayDensity', SIGNATURE_GENOME.rayDensity + 0.1)).toBe(false);
  });
});
describe('signatureMarkerPercent', () => {
  it('places the tick inside the slider range', () => {
    for (const key of Object.keys(GENE_DEFINITIONS) as Array<keyof typeof GENE_DEFINITIONS>) {
      const percent = signatureMarkerPercent(key);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});
