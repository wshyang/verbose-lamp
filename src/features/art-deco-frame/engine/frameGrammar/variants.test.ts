import { describe, expect, it } from 'vitest';
import { DESIGN_GALLERY } from '../../../frame-studio/data/frameDesigns';
import { GENE_DEFINITIONS } from './genome';
import {
  SIGNATURE_GENOME,
  clampGene,
  clampGenome,
  type BaseGenome,
  type GeneKey,
} from './genome';
import { buildEdgeBorder as buildEdgeBorderGeometry, buildFrame as buildFrameGeometry } from './index';
import { resolveGenesisLevel } from './styleRules';
import { buildAuthoredFrame } from './index';

const GENES = Object.keys(GENE_DEFINITIONS) as GeneKey[];
const GENOMES: Array<[string, BaseGenome]> = [
  ['signature', SIGNATURE_GENOME],
  ...DESIGN_GALLERY.map((entry): [string, BaseGenome] => [entry.label, entry.genome]),
];

/** Every gene at each end of its range: the widest shapes the frame can take. */
const EXTREMES: Array<[string, BaseGenome]> = GENES.flatMap((key) => [
  [`${key}@min`, clampGenome({ ...SIGNATURE_GENOME, [key]: -999 })],
  [`${key}@max`, clampGenome({ ...SIGNATURE_GENOME, [key]: 999 })],
]);

function frameOf(genome: BaseGenome) {
  return buildFrameGeometry({
    archetype: 'gatsby_hero',
    mainWidth: 5.4,
    formula: { source: 'authored', level: 2, genome },
  });
}

describe('authored frames', () => {
  it('the back-compatible wrapper matches an authored formula', () => {
    const wrapped = buildAuthoredFrame('gatsby_hero', 5.4, SIGNATURE_GENOME);
    expect(wrapped).toEqual(frameOf(SIGNATURE_GENOME));
    expect(buildAuthoredFrame('gatsby_hero', 5.4, SIGNATURE_GENOME, 0.5)).toEqual(wrapped);
  });
});

describe('gene clamping', () => {
  it('falls back to the signature for a non-finite gene', () => {
    for (const key of GENES) {
      expect(clampGene(key, Number.NaN)).toBe(GENE_DEFINITIONS[key].signature);
    }
  });

  it('rounds integer genes and leaves continuous ones alone', () => {
    expect(clampGene('zigguratSteps', 2.6)).toBe(3);
    expect(clampGene('rayDensity', 1.234)).toBeCloseTo(1.234, 6);
  });

  it('keeps the genesis level an integer inside 1..4', () => {
    expect(resolveGenesisLevel(Number.NaN)).toBe(2);
    expect(resolveGenesisLevel(9)).toBe(4);
    expect(resolveGenesisLevel(0.2)).toBe(1);
    expect(resolveGenesisLevel(2.6)).toBe(3);
  });
});

describe('frames across the whole gene space', () => {
  it.each([...GENOMES, ...EXTREMES])('%s builds a finite frame', (_label, genome) => {
    const specs = frameOf(genome);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec.points.length).toBeGreaterThanOrEqual(2);
      for (const point of spec.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
      expect(Number.isFinite(spec.width)).toBe(true);
      expect(spec.width).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives rounded and notched corners different silhouettes', () => {
    const silhouette = (profile: number) => JSON.stringify(frameOf(clampGenome({ ...SIGNATURE_GENOME, cornerProfile: profile })));
    const chamfered = silhouette(0);
    expect(silhouette(0.9)).not.toBe(chamfered);
    expect(silhouette(-0.9)).not.toBe(chamfered);
    expect(silhouette(0.9)).not.toBe(silhouette(-0.9));
  });
});

describe('edge borders across the whole gene space', () => {
  it.each([...GENOMES, ...EXTREMES])('%s builds a finite, dense border', (_label, genome) => {
    for (const aspect of [0.5, 1.78, 3.2]) {
      for (const density of [0, 0.5, 1]) {
        const { specs, extentX, extentY } = buildEdgeBorderGeometry({ aspect, genome, density });
        expect(specs.length).toBeGreaterThan(0);
        // Dense genomes fan their corner rays past the frame edge on narrow
        // viewports; the composite clips them (ADDENDUM-028 §5, known limit).
        expect(extentX).toBeLessThanOrEqual(aspect * 5 + 1e-9);
        expect(extentY).toBeLessThanOrEqual(5);
        for (const spec of specs) {
          for (const point of spec.points) {
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isFinite(point.y)).toBe(true);
          }
        }
      }
    }
  });

  it('adds ruler refinement with recursion depth', () => {
    const flat = buildEdgeBorderGeometry({ aspect: 1.78, genome: clampGenome({ ...SIGNATURE_GENOME, fractalDepth: 0 }), density: 1 });
    const deep = buildEdgeBorderGeometry({ aspect: 1.78, genome: clampGenome({ ...SIGNATURE_GENOME, fractalDepth: 3 }), density: 1 });
    expect(deep.specs.length).toBeGreaterThan(flat.specs.length);
  });

  it('adds reeds with the corner scale and clamps a wild aspect', () => {
    const huge = buildEdgeBorderGeometry({ aspect: 40, genome: SIGNATURE_GENOME, density: 1 });
    expect(huge.extentX).toBeLessThanOrEqual(3.2 + 1e-9);
    const tiny = buildEdgeBorderGeometry({ aspect: 0.01, genome: SIGNATURE_GENOME, density: 0 });
    expect(tiny.specs.length).toBeGreaterThan(0);
  });
});

describe('out-of-range genes', () => {
  // buildEdgeBorder clamps its genome at the entry, which is why cornerFan and
  // reeding carry no degenerate-length guards: a zero reach can never arrive.
  it('treats a collapsed genome exactly like the gene minimums', () => {
    const collapsed = buildEdgeBorderGeometry({
      aspect: 1.5,
      genome: { ...SIGNATURE_GENOME, rayReach: 0, wingSweep: 0, fractalRatio: 0, fractalDepth: 0 } as BaseGenome,
      density: 0.5,
    });
    const minimums = buildEdgeBorderGeometry({
      aspect: 1.5,
      genome: clampGenome({ ...SIGNATURE_GENOME, rayReach: 0, wingSweep: 0, fractalRatio: 0, fractalDepth: 0 }),
      density: 0.5,
    });
    expect(collapsed.specs).toEqual(minimums.specs);
    expect(collapsed.specs.length).toBeGreaterThan(0);
  });

  it('keeps every spec longer than a hairline', () => {
    const { specs } = buildEdgeBorderGeometry({
      aspect: 1,
      genome: clampGenome({ ...SIGNATURE_GENOME }),
      density: 0,
    });
    for (const spec of specs) {
      const [start, end] = spec.points;
      if (spec.points.length === 2) expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(0.003);
    }
  });
});
