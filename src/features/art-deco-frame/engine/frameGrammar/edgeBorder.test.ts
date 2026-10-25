import { describe, expect, it } from 'vitest';
import { buildEdgeBorder, buildFrame, viewportScaleAtDistance } from './index';
import {
  SIGNATURE_GENOME,
  clampGene,
  clampGenome,
  genomeForVariant,
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

describe('genome and border edge cases', () => {
  it('falls back to the signature gene for non-finite values', () => {
    expect(clampGene('rayDensity', Number.NaN)).toBe(SIGNATURE_GENOME.rayDensity);
    expect(clampGene('wingDelta', Number.POSITIVE_INFINITY)).toBe(SIGNATURE_GENOME.wingDelta);
  });

  it('refines corner fans and reeding when the fractal genes are engaged', () => {
    const fractal = withGene(
      withGene(withGene(SIGNATURE_GENOME, 'fractalDepth', 3), 'fractalRatio', 0.3),
      'rayDensity',
      1.6
    );
    const plain = buildEdgeBorder({ aspect: 1.78, genome: SIGNATURE_GENOME, density: 1 });
    const refined = buildEdgeBorder({ aspect: 1.78, genome: fractal, density: 1 });
    expect(refined.specs.length).toBeGreaterThan(plain.specs.length);
    expect(
      refined.specs.every((spec) => spec.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    ).toBe(true);
  });

  it('uses the 1925 lattice seed by default and changes walks with an explicit seed', () => {
    const byDefault = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice' });
    const explicit = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice', seed: 1925 });
    const other = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice', seed: 7 });
    expect(byDefault).toEqual(explicit);
    expect(other.specs).not.toEqual(byDefault.specs);
    expect(byDefault.specs.length).toBeGreaterThan(0);
  });
});

describe('viewport edge border seam snapping', () => {
  it('snaps a corner-fan arc that lands on the seam to exact zero', () => {
    // reach (0.42 * rayReach) equals the fan origin x (aspect - 0.02 = 0.48),
    // so the base-arc endpoint falls on x = 0 within float error.
    const genome = withGene(SIGNATURE_GENOME, 'rayReach', 0.48 / 0.42);
    const { specs } = buildEdgeBorder({ aspect: 0.5, genome, density: 0.5 });
    const seam = specs.flatMap((spec) => spec.points).filter((point) => point.x === 0 && Math.abs(point.y) > 0.97);
    expect(seam.length).toBeGreaterThan(0);
  });
});
