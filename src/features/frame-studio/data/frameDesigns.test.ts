import { describe, expect, it } from 'vitest';
import {
  clampGenome,
  genomeForVariant,
  GENE_DEFINITIONS,
  SIGNATURE_GENOME,
  withGene,
  type BaseGenome,
  type GeneKey,
} from '@/features/art-deco-frame';
import {
  DESIGN_GALLERY,
  describeDesign,
  designAt,
  findDesignEntry,
  formatGeneValue,
  GENE_GROUPS,
  GENE_UI,
  isGeneAtSignature,
  signatureMarkerPercent,
  VARIATION_COUNT,
} from './frameDesigns';

const keys = Object.keys(SIGNATURE_GENOME) as GeneKey[];

describe('frame design gallery', () => {
  it('opens with the signature original and keeps it first', () => {
    expect(DESIGN_GALLERY[0].kind).toBe('original');
    expect(DESIGN_GALLERY[0].label).toBe('Original');
    expect(DESIGN_GALLERY[0].genome).toEqual(SIGNATURE_GENOME);
    expect(DESIGN_GALLERY.map((entry) => entry.index)).toEqual(
      DESIGN_GALLERY.map((_, position) => position)
    );
  });

  it('lists five named designs and six variations after the original', () => {
    const named = DESIGN_GALLERY.filter((entry) => entry.kind === 'named');
    const variations = DESIGN_GALLERY.filter((entry) => entry.kind === 'variation');

    expect(named.map((entry) => entry.label)).toEqual([
      'Skyscraper',
      'Moderne',
      'Jazz Fan',
      'Cathedral',
      'Filigree',
    ]);
    expect(variations).toHaveLength(VARIATION_COUNT);
    expect(variations[0].genome).toEqual(genomeForVariant(1));
    expect(variations.at(-1)!.label).toBe(`Variation ${VARIATION_COUNT}`);
  });

  it('keeps every genome inside the gene bounds', () => {
    for (const entry of DESIGN_GALLERY) {
      expect(entry.genome).toEqual(clampGenome(entry.genome));
    }
  });

  it('wraps around when selecting by index', () => {
    const total = DESIGN_GALLERY.length;

    expect(designAt(0)).toBe(DESIGN_GALLERY[0]);
    expect(designAt(total)).toBe(DESIGN_GALLERY[0]);
    expect(designAt(total + 2)).toBe(DESIGN_GALLERY[2]);
    expect(designAt(-1)).toBe(DESIGN_GALLERY[total - 1]);
    expect(designAt(-total - 1)).toBe(DESIGN_GALLERY[total - 1]);
    expect(designAt(1.4)).toBe(DESIGN_GALLERY[1]);
  });

  it('finds a gallery entry by genome and reports custom ones as undefined', () => {
    expect(findDesignEntry(SIGNATURE_GENOME)?.label).toBe('Original');
    expect(findDesignEntry(genomeForVariant(3))?.label).toBe('Variation 3');
    expect(findDesignEntry(withGene(SIGNATURE_GENOME, 'rayDensity', 1.42))).toBeUndefined();
  });

  it('names a design, falling back to Original and Custom', () => {
    expect(describeDesign(DESIGN_GALLERY[0], SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(DESIGN_GALLERY[3], DESIGN_GALLERY[3].genome)).toBe('Jazz Fan');
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, withGene(SIGNATURE_GENOME, 'wingDelta', 2.5))).toBe('Custom');
  });
});

describe('gene copy', () => {
  it('labels every gene with a hint', () => {
    expect(Object.keys(GENE_UI).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(GENE_UI[key].key).toBe(key);
      expect(GENE_UI[key].label.length).toBeGreaterThan(0);
      expect(GENE_UI[key].hint.length).toBeGreaterThan(0);
    }
  });

  it('groups each gene exactly once', () => {
    const grouped = GENE_GROUPS.flatMap((group) => group.genes);

    expect(grouped.sort()).toEqual([...keys].sort());
    for (const group of GENE_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.caption.length).toBeGreaterThan(0);
    }
  });

  it('formats corners, stairs, wings and recursion', () => {
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', 0.42)).toBe('Rounded 42%');
    expect(formatGeneValue('cornerProfile', -0.42)).toBe('Notched 42%');
    expect(formatGeneValue('zigguratSteps', 1)).toBe('1 stair');
    expect(formatGeneValue('zigguratSteps', 3)).toBe('3 stairs');
    expect(formatGeneValue('wingDelta', 0)).toBe('±0 wings');
    expect(formatGeneValue('wingDelta', 1)).toBe('+1 wing');
    expect(formatGeneValue('wingDelta', -2)).toBe('−2 wings');
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
    expect(formatGeneValue('fractalDepth', 2)).toBe('Depth 2');
    expect(formatGeneValue('fractalRatio', 0.5)).toBe('r = 0.50');
    expect(formatGeneValue('cornerScale', 1.25)).toBe('×1.25');
  });

  it('marks a gene at its signature value', () => {
    const key = keys[0];

    expect(isGeneAtSignature(key, SIGNATURE_GENOME[key])).toBe(true);
    expect(isGeneAtSignature(key, SIGNATURE_GENOME[key] + 0.5)).toBe(false);
  });

  it('places the signature tick where the slider crosses it', () => {
    for (const key of keys) {
      const percent = signatureMarkerPercent(key);
      const { min, max, signature } = GENE_DEFINITIONS[key];

      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
      expect(percent).toBeCloseTo(((signature - min) / (max - min)) * 100);
    }
  });

  it('accepts a plain genome when describing a design', () => {
    const genome: BaseGenome = { ...SIGNATURE_GENOME };

    expect(describeDesign(DESIGN_GALLERY[0], genome)).toBe('Original');
  });
});
