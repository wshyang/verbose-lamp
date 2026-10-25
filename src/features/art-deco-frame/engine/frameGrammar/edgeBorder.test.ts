import { describe, expect, it } from 'vitest';
import { buildEdgeBorder, buildFrame, viewportScaleAtDistance } from './index';
import {
  SIGNATURE_GENOME,
  clampGenome,
  genomeForVariant,
  GENE_DEFINITIONS,
  type GeneKey,
  isSignatureGenome,
  withGene,
  type BaseGenome,
} from './genome';
import { DESIGN_GALLERY, designAt, findDesignEntry } from '../../../frame-studio/data/frameDesigns';

describe('genome', () => {
  it('signature genome is the delivered frame', () => {
    expect(isSignatureGenome(SIGNATURE_GENOME)).toBe(true);
    const authored = buildFrame({ archetype: 'gatsby_hero', mainWidth: 5.4 });
    const withSignature = buildFrame({
      archetype: 'gatsby_hero',
      mainWidth: 5.4,
      formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME } },
    });
    expect(withSignature).toEqual(authored);
  });

  it('genes actually reshape the frame', () => {
    const base = buildFrame({
      archetype: 'gatsby_hero',
      mainWidth: 5.4,
      formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME } },
    });
    const denser = buildFrame({
      archetype: 'gatsby_hero',
      mainWidth: 5.4,
      formula: { source: 'authored', level: 2, genome: withGene(SIGNATURE_GENOME, 'rayDensity', 1.5) },
    });
    const winged = buildFrame({
      archetype: 'gatsby_hero',
      mainWidth: 5.4,
      formula: { source: 'authored', level: 2, genome: withGene(SIGNATURE_GENOME, 'wingDelta', 2) },
    });
    expect(denser.length).toBeGreaterThan(base.length);
    expect(winged.length).toBeGreaterThan(base.length);
  });

  it('recursion dashes the rules and is inert at depth 0', () => {
    const options = { archetype: 'gatsby_hero' as const, mainWidth: 5.4 };
    const off = buildFrame({ ...options, formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME } } });
    const on = buildFrame({
      ...options,
      formula: { source: 'authored', level: 2, genome: withGene(SIGNATURE_GENOME, 'fractalDepth', 2) },
    });
    expect(on.length).toBeGreaterThan(off.length);
  });

  it('clamps out-of-range genes and preserves variation determinism', () => {
    expect(clampGenome({ cornerScale: 99 }).cornerScale).toBe(1.8);
    expect(genomeForVariant(3)).toEqual(genomeForVariant(3));
    expect(isSignatureGenome(genomeForVariant(0))).toBe(true);
    expect(isSignatureGenome(genomeForVariant(4))).toBe(false);
  });
});

describe('design gallery', () => {
  it('starts at the original and resolves custom genomes to Custom', () => {
    expect(DESIGN_GALLERY[0]).toMatchObject({ label: 'Original', kind: 'original' });
    expect(findDesignEntry(SIGNATURE_GENOME)?.index).toBe(0);
    expect(findDesignEntry(withGene(SIGNATURE_GENOME, 'rayDensity', 1.4))).toBeUndefined();
    expect(designAt(-1).label).toBe(DESIGN_GALLERY[DESIGN_GALLERY.length - 1].label);
  });
});

describe('viewport edge border', () => {
  const border = (aspect: number, density = 0.5, genome: BaseGenome = SIGNATURE_GENOME) =>
    buildEdgeBorder({ aspect, genome, density });

  it('stays inside the viewport in unit space', () => {
    for (const aspect of [0.5, 1.78, 3.2]) {
      const { specs, extentX, extentY } = border(aspect, 1);
      expect(extentX).toBeLessThanOrEqual(aspect);
      expect(extentY).toBeLessThanOrEqual(1);
      for (const spec of specs) {
        for (const point of spec.points) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(aspect);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('draws a closed outer frame and four-fold symmetric ornament', () => {
    const { specs } = border(1.78, 1);
    // Nested rules are emitted as mirrored open halves that meet on the x = 0 seam —
    // the same convention as the title-card frames — so they are not closed loops.
    const frames = specs.filter((spec) => spec.kind === 'frame');
    expect(frames).toHaveLength(2);
    expect(frames.map((spec) => spec.partDir).sort()).toEqual([-1, 1]);
    const reach = Math.max(...frames.flatMap((spec) => spec.points.map((point) => Math.abs(point.x))));
    expect(reach).toBeCloseTo(1.78 - 0.045, 4);
    const snap = (value: number) => (Object.is(value, 0) ? 0 : value);
    const key = (spec: typeof specs[number], mx: boolean, my: boolean) =>
      JSON.stringify(
        spec.points
          .map((p) => [
            snap(Math.round(p.x * (mx ? -1 : 1) * 1e4) / 1e4),
            snap(Math.round(p.y * (my ? -1 : 1) * 1e4) / 1e4),
          ])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      );
    const set = new Set(specs.filter((s) => s.kind !== 'frame').map((s) => key(s, false, false)));
    for (const spec of specs.filter((s) => s.kind !== 'frame')) {
      expect(set.has(key(spec, true, false))).toBe(true);
      expect(set.has(key(spec, false, true))).toBe(true);
      expect(set.has(key(spec, true, true))).toBe(true);
    }
  });

  it('adds rails with weight and reshapes with the genome', () => {
    const low = border(1.78, 0).specs.length;
    const high = border(1.78, 1).specs.length;
    expect(high).toBeGreaterThan(low);
    const genome = withGene(SIGNATURE_GENOME, 'rayDensity', 1.6);
    expect(border(1.78, 1, genome).specs.length).toBeGreaterThan(border(1.78, 1).specs.length);
  });

  it('is deterministic and scales to the frustum', () => {
    expect(border(1.78)).toEqual(border(1.78));
    expect(viewportScaleAtDistance(3, Math.PI / 3)).toBeCloseTo(3 * Math.tan(Math.PI / 6), 10);
  });
});

describe('reeding recursion on every edge', () => {
  const aspect = 1.6;
  const recursive = { ...SIGNATURE_GENOME, fractalDepth: 1, fractalRatio: 0.45 };
  const plain = { ...SIGNATURE_GENOME, fractalDepth: 0 };

  // Sub-ticks sit one z-step behind their parent ticks (z -0.01 to -0.02). On the side runs
  // a tick points sideways, so its sub-tick is a horizontal segment hugging the side edge.
  // Corner-fan rays share that z and can lie flat near the edge too, so only reeding
  // ticks (kind 'rule') count; without that filter this passes even when the bug is present.
  const sideSubTicks = (genome: BaseGenome) =>
    buildEdgeBorder({ aspect, density: 0.5, genome }).specs.filter(
      (spec) =>
        spec.kind === 'rule' &&
        spec.z === -0.02 &&
        spec.points.length === 2 &&
        spec.points[0].y === spec.points[1].y &&
        Math.abs(spec.points[0].x) > aspect - 0.2
    );

  it('subdivides the vertical (side) runs as well as the horizontal ones', () => {
    expect(sideSubTicks(recursive).length).toBeGreaterThan(0);
  });

  it('adds no side sub-ticks when recursion is off', () => {
    expect(sideSubTicks(plain)).toHaveLength(0);
  });

  it('gives the left and right side runs the same number of sub-ticks', () => {
    const ticks = sideSubTicks(recursive);
    const right = ticks.filter((spec) => spec.points[0].x > 0).length;
    const left = ticks.filter((spec) => spec.points[0].x < 0).length;

    expect(right).toBeGreaterThan(0);
    expect(left).toBe(right);
  });
});

// Replaces the per-rib and per-tick length guards the border used to carry. The claim is that
// no legal genome can make a ray or tick degenerate, so this sweeps every corner of the gene
// box (each gene at its min and max) over the extreme aspects and weights and checks it.
describe('edge border genome sweep', () => {
  const KEYS = Object.keys(GENE_DEFINITIONS) as GeneKey[];
  const MIN_VISIBLE_LENGTH = 0.004;

  const corners = (): BaseGenome[] =>
    Array.from({ length: 2 ** KEYS.length }, (_, mask) =>
      KEYS.reduce(
        (genome, key, bit) =>
          withGene(genome, key, mask & (1 << bit) ? GENE_DEFINITIONS[key].max : GENE_DEFINITIONS[key].min),
        { ...SIGNATURE_GENOME }
      )
    );

  const segmentLength = (points: readonly { x: number; y: number }[]) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

  // One assertion over the whole sweep: thousands of `expect` calls would dominate the run time,
  // and collecting the offenders gives a failure message that names the genome.
  it('never produces a degenerate or non-finite ray or tick for any legal genome', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const genome of corners()) {
      for (const [aspect, density] of [[0.5, 0], [3.2, 1], [1.78, 0.5]] as const) {
        for (const spec of buildEdgeBorder({ aspect, density, genome }).specs) {
          checked += 1;
          const isFinitePath = spec.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
          const isMeasured = (spec.kind === 'ray' || spec.kind === 'rule') && spec.points.length === 2;
          const isTooShort = isMeasured && segmentLength(spec.points) < MIN_VISIBLE_LENGTH;
          if (!isFinitePath || isTooShort) {
            offenders.push(`${spec.kind} @ aspect ${aspect}, density ${density}: ${JSON.stringify(genome)}`);
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(100_000);
    expect(offenders.slice(0, 3)).toEqual([]);
  }, 60_000);
});
