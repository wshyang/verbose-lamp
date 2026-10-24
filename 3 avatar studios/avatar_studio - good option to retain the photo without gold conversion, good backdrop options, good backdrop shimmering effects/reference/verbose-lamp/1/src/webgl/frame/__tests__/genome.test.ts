import { describe, expect, it } from 'vitest';
import type { FrameArchetype } from '../../../types/sequence';
import {
  EXPLORER_PHI,
  GENE_DEFINITIONS,
  GENE_ORDER,
  MAX_BASE_RAILS,
  MAX_FRAME_RAILS,
  MAX_FRAME_VERTICES,
  SAFE_FRAME_EXTENT_Y,
  SIGNATURE_GENOME,
  aggregateFrameStats,
  buildBaseOrnaments,
  buildFrameGeometry,
  cantorIntervals,
  childDiamonds,
  clampGenome,
  genomeForVariant,
  interpretMotif,
  isSignatureGenome,
  nextVariantIndex,
  polylineLength,
  twoAdicValuation,
  variantCoordinates,
  withGene,
  type BaseGenome,
  type FrameSpec,
  type Motif,
} from '../index';
import {
  GENOME_PRESETS,
  DESIGN_GALLERY,
  describeDesign,
  findDesignEntry,
  findActiveGenomePreset,
  formatGeneValue,
} from '../../../data/frameGenomeUi';
import { ARCHETYPES, renderFields, symmetryKeys } from './frameTestKit';

const WIDTH = 5.4;

function baseOf(archetype: FrameArchetype, genome: Partial<BaseGenome>): FrameSpec[] {
  return buildBaseOrnaments({ archetype, mainWidth: WIDTH, genome: clampGenome(genome) });
}

function genomeFrom(pick: (key: (typeof GENE_ORDER)[number]) => number): BaseGenome {
  return clampGenome(
    GENE_ORDER.reduce<Partial<BaseGenome>>((genome, key) => ({ ...genome, [key]: pick(key) }), {})
  );
}

const ALL_MIN = genomeFrom((key) => GENE_DEFINITIONS[key].min);
const ALL_MAX = genomeFrom((key) => GENE_DEFINITIONS[key].max);
const VARIANTS = Array.from({ length: 40 }, (_, index) => genomeForVariant(index + 1));
const STRESS_GENOMES = [...GENOME_PRESETS.map((preset) => preset.genome), ALL_MIN, ALL_MAX];

const FAN: Motif = {
  kind: 'sunburst',
  centerX: 0,
  centerY: 0,
  innerRadius: 0.4,
  outerRadius: 1.6,
  rays: 13,
  spread: Math.PI * 0.8,
  direction: 'up',
  width: 0.03,
  depth: 0.08,
  z: 0,
  delay: 0.2,
};

function reach(spec: FrameSpec): number {
  const [start, end] = spec.points;
  return Math.hypot(end.x, end.y) - Math.hypot(start.x, start.y);
}

describe('base genome: preservation', () => {
  it('signature genome passed explicitly equals the default path at every intricacy', () => {
    for (const archetype of ARCHETYPES) {
      for (const intricacy of [0, 0.25, 0.5, 0.75, 1]) {
        const implicit = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy });
        const explicit = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy, genome: SIGNATURE_GENOME });
        expect(explicit.specs.map(renderFields), `${archetype}@${intricacy}`).toEqual(implicit.specs.map(renderFields));
      }
    }
  });

  it('treats the recursion ratio as inert at depth zero', () => {
    const inert = { ...SIGNATURE_GENOME, fractalRatio: 0.31 };
    expect(isSignatureGenome(inert)).toBe(true);
    for (const archetype of ARCHETYPES) {
      expect(baseOf(archetype, inert).map(renderFields)).toEqual(baseOf(archetype, SIGNATURE_GENOME).map(renderFields));
    }
  });

  it('keeps the camera framing of the original: signature vertical reach within the safe envelope', () => {
    for (const archetype of ARCHETYPES) {
      for (const width of [3.2, 5.4, 9.5]) {
        const { stats } = buildFrameGeometry({ archetype, mainWidth: width, intricacy: 0.5 });
        expect(stats.baseExtentY, `${archetype}@${width}`).toBeLessThanOrEqual(SAFE_FRAME_EXTENT_Y);
      }
    }
  });
});

describe('base genome: contract', () => {
  it('fills, clamps, rounds and sanitizes genes, idempotently', () => {
    expect(clampGenome()).toEqual(SIGNATURE_GENOME);
    const wild = clampGenome({ cornerScale: 9, cornerProfile: -4, zigguratSteps: 2.6, wingDelta: -9, fractalDepth: Number.NaN });
    expect(wild).toMatchObject({ cornerScale: 1.8, cornerProfile: -1, zigguratSteps: 3, wingDelta: -3, fractalDepth: 0 });
    expect(clampGenome(wild)).toEqual(wild);
    for (const key of GENE_ORDER) {
      expect(GENE_DEFINITIONS[key].signature, key).toBe(SIGNATURE_GENOME[key]);
    }
  });

  it('withGene returns a new clamped genome and leaves the input untouched', () => {
    const next = withGene(SIGNATURE_GENOME, 'rayDensity', 7);
    expect(next.rayDensity).toBe(1.6);
    expect(next).not.toBe(SIGNATURE_GENOME);
    expect(SIGNATURE_GENOME.rayDensity).toBe(1);
  });

  it('every active gene visibly changes the architecture of at least one act', () => {
    const signature = ARCHETYPES.map((archetype) => baseOf(archetype, SIGNATURE_GENOME).map(renderFields).join('|'));
    for (const key of GENE_ORDER) {
      const context = key === 'fractalRatio' ? { fractalDepth: 2 } : {};
      const reference = ARCHETYPES.map((archetype) => baseOf(archetype, { ...context }).map(renderFields).join('|'));
      for (const bound of [GENE_DEFINITIONS[key].min, GENE_DEFINITIONS[key].max]) {
        if (bound === SIGNATURE_GENOME[key]) continue;
        const moved = ARCHETYPES.map((archetype) => baseOf(archetype, { ...context, [key]: bound }).map(renderFields).join('|'));
        const baseline = key === 'fractalRatio' ? reference : signature;
        expect(moved.some((value, index) => value !== baseline[index]), `${key}=${bound}`).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    const genome = genomeForVariant(17);
    expect(baseOf('gatsby_hero', genome)).toEqual(baseOf('gatsby_hero', genome));
  });
});

describe('base genome: invariants across the design space', () => {
  it('stays mirror-symmetric for presets, range extremes and explorer variants', () => {
    const cases = [
      ...STRESS_GENOMES.flatMap((genome) => [0.5, 1].map((intricacy) => ({ genome, intricacy }))),
      ...VARIANTS.map((genome) => ({ genome, intricacy: 0.5 })),
    ];
    for (const { genome, intricacy } of cases) {
      for (const archetype of ARCHETYPES) {
        const { specs } = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy, genome });
        const { forward, mirrored } = symmetryKeys(specs);
        expect(mirrored, `${archetype}@${intricacy} ${JSON.stringify(genome)}`).toEqual(forward);
      }
    }
  });

  it('respects base, total and vertex budgets with well-formed rails', () => {
    for (const genome of [...STRESS_GENOMES, ...VARIANTS]) {
      for (const archetype of ARCHETYPES) {
        expect(baseOf(archetype, genome).length, archetype).toBeLessThanOrEqual(MAX_BASE_RAILS);
        const { specs, stats } = buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy: 1, genome });
        expect(stats.railCount).toBeLessThanOrEqual(MAX_FRAME_RAILS);
        expect(stats.vertexCount).toBeLessThanOrEqual(MAX_FRAME_VERTICES);
        for (const spec of specs) {
          expect(spec.points.length).toBeGreaterThanOrEqual(2);
          expect(spec.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
          expect(spec.width).toBeGreaterThan(0);
          expect(spec.delay).toBeGreaterThanOrEqual(0);
          expect(spec.delay).toBeLessThanOrEqual(0.7);
        }
      }
    }
  });

  it('grows fractal detail monotonically with depth and only at depth ≥ 1', () => {
    for (const archetype of ARCHETYPES) {
      const counts = [0, 1, 2, 3].map(
        (fractalDepth) => baseOf(archetype, { fractalDepth }).filter((spec) => spec.role === 'fractal').length
      );
      expect(counts[0], archetype).toBe(0);
      expect(counts[1], archetype).toBeGreaterThan(0);
      expect(counts[2]).toBeGreaterThanOrEqual(counts[1]);
      expect(counts[3]).toBeGreaterThanOrEqual(counts[2]);
    }
  });
});

describe('motif family laws', () => {
  it('ziggurat: n stairs give 4n + 4 points per half and a constant total setback', () => {
    for (let steps = 1; steps <= 5; steps += 1) {
      const [half] = baseOf('ziggurat_chevron', { zigguratSteps: steps });
      expect(half.points).toHaveLength(4 * steps + 4);
      const cornerFoot = half.points[2 * steps + 1];
      expect(cornerFoot.y).toBeCloseTo(1.68 - 2 * 0.26, 12);
    }
  });

  it('sunburst: ray counts stay odd and the axial ray survives', () => {
    for (const rayDensity of [0.5, 0.8, 1, 1.3, 1.6]) {
      const specs = interpretMotif(FAN, clampGenome({ rayDensity }));
      const rays = specs.length - 2;
      expect(rays % 2, `ρ=${rayDensity}`).toBe(1);
      expect(specs.some((spec) => Math.abs(spec.points[1]?.x ?? 1) < 1e-12)).toBe(true);
    }
  });

  it('ruler refinement: level-ℓ rays reach at most r^ℓ of the base reach', () => {
    const genome = clampGenome({ fractalDepth: 3, fractalRatio: 0.45 });
    const specs = interpretMotif(FAN, genome);
    const baseReach = Math.max(...specs.filter((spec) => spec.role === 'ornament' && spec.points.length === 2).map(reach));
    const inserted = specs.filter((spec) => spec.role === 'fractal');
    expect(inserted.length).toBeGreaterThan(0);
    expect(Math.max(...inserted.map(reach))).toBeLessThanOrEqual(0.45 * baseReach + 1e-9);
    expect(twoAdicValuation(12, 5)).toBe(2);
    expect(twoAdicValuation(8, 2)).toBe(2);
    expect(twoAdicValuation(7, 3)).toBe(0);
  });

  it('Cantor rule: 2^d ordered segments whose total length is (2r)^d · |I|', () => {
    const intervals = cantorIntervals(0, 2, 3, 0.4);
    expect(intervals).toHaveLength(8);
    const total = intervals.reduce((sum, [a, b]) => sum + (b - a), 0);
    expect(total).toBeCloseTo(Math.pow(0.8, 3) * 2, 12);
    intervals.slice(1).forEach(([a], index) => expect(a).toBeGreaterThan(intervals[index][1]));
    expect(cantorIntervals(0, 0.1, 3, 0.45)).toEqual([[0, 0.1]]);
  });

  it('H-tree: children are r-scaled and touch the parent tip-to-tip', () => {
    const [left, right] = childDiamonds({ cx: 0, cy: 0, rx: 1, ry: 0.5 }, 'x', 0.45);
    expect(right).toEqual({ cx: 1.45, cy: 0, rx: 0.45, ry: 0.225 });
    expect(left.cx).toBe(-1.45);
    expect(right.cx - right.rx).toBeCloseTo(1, 12);
  });

  it('rails derived by recursion are never zero-length', () => {
    const specs = baseOf('gatsby_hero', { fractalDepth: 3, fractalRatio: 0.3 });
    expect(specs.filter((spec) => spec.role === 'fractal').every((spec) => polylineLength(spec) > 0)).toBe(true);
  });
});

describe('variant explorer and presets', () => {
  it('uses the generalised golden ratio for ten dimensions', () => {
    expect(Math.pow(EXPLORER_PHI, 11)).toBeCloseTo(EXPLORER_PHI + 1, 12);
    expect(variantCoordinates(7).every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('maps #0 to the signature and #k to distinct, in-range, slider-reachable genomes', () => {
    expect(genomeForVariant(0)).toEqual(SIGNATURE_GENOME);
    const keys = new Set<string>();
    for (let index = 1; index <= 64; index += 1) {
      const genome = genomeForVariant(index);
      expect(isSignatureGenome(genome), `#${index}`).toBe(false);
      keys.add(JSON.stringify(genome));
      for (const key of GENE_ORDER) {
        const definition = GENE_DEFINITIONS[key];
        expect(genome[key]).toBeGreaterThanOrEqual(definition.exploreMin);
        expect(genome[key]).toBeLessThanOrEqual(definition.exploreMax);
        const stepsFromMin = (genome[key] - definition.min) / definition.step;
        expect(Math.abs(stepsFromMin - Math.round(stepsFromMin)), `${key} on slider grid`).toBeLessThan(1e-6);
      }
    }
    expect(keys.size).toBe(64);
    expect(genomeForVariant(23)).toEqual(genomeForVariant(23));
  });

  it('steps variant indices without going below zero', () => {
    expect(nextVariantIndex(null, 1)).toBe(1);
    expect(nextVariantIndex(0, -1)).toBe(0);
    expect(nextVariantIndex(5, -1)).toBe(4);
  });

  it('defines valid, distinct presets with a true signature preset', () => {
    expect(new Set(GENOME_PRESETS.map((preset) => preset.id)).size).toBe(GENOME_PRESETS.length);
    expect(isSignatureGenome(GENOME_PRESETS[0].genome)).toBe(true);
    for (const preset of GENOME_PRESETS.slice(1)) {
      expect(clampGenome(preset.genome), preset.id).toEqual(preset.genome);
      expect(isSignatureGenome(preset.genome), preset.id).toBe(false);
      expect(findActiveGenomePreset(preset.genome)?.id).toBe(preset.id);
    }
  });

  it('describes designs and locates them in the gallery', () => {
    const original = DESIGN_GALLERY[0];
    expect(original.kind).toBe('original');
    expect(describeDesign(original, original.genome)).toBe('Original');
    expect(describeDesign(undefined, SIGNATURE_GENOME)).toBe('Original');
    expect(describeDesign(undefined, withGene(SIGNATURE_GENOME, 'rayReach', 1.13))).toBe('Custom');
    expect(findDesignEntry(DESIGN_GALLERY[3].genome)?.index).toBe(3);
    expect(findDesignEntry(withGene(SIGNATURE_GENOME, 'rayReach', 1.07))).toBeUndefined();
    expect(formatGeneValue('cornerProfile', 0)).toBe('Chamfer');
    expect(formatGeneValue('cornerProfile', -0.5)).toBe('Notched 50%');
    expect(formatGeneValue('wingDelta', -1)).toBe('−1 wing');
    expect(formatGeneValue('fractalDepth', 0)).toBe('Off');
  });

  it('keeps the design gallery ordered and free of duplicates', () => {
    expect(DESIGN_GALLERY[0].label).toBe('Original');
    expect(DESIGN_GALLERY.map((entry) => entry.index)).toEqual(DESIGN_GALLERY.map((_, index) => index));
    const genomes = new Set(DESIGN_GALLERY.map((entry) => JSON.stringify(entry.genome)));
    expect(genomes.size).toBe(DESIGN_GALLERY.length);
  });
});

describe('stats aggregation', () => {
  it('sums counts and keeps the largest envelopes across cards', () => {
    const cards = ARCHETYPES.map((archetype) => buildFrameGeometry({ archetype, mainWidth: WIDTH, intricacy: 0.7 }).stats);
    const total = aggregateFrameStats(cards, 0.7);
    expect(total.railCount).toBe(cards.reduce((sum, card) => sum + card.railCount, 0));
    expect(total.extentY).toBe(Math.max(...cards.map((card) => card.extentY)));
    expect(total.intricacy).toBe(0.7);
  });
});
