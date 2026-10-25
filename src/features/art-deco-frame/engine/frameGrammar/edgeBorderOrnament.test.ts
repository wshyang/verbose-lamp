import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_GENOME,
  withGene,
  type BaseGenome,
} from './genome';
import { buildEdgeBorder, buildLatticeProscenium, viewportScaleAtDistance } from './edgeBorder';

/**
 * The ornament branches of the screen border: corner fans, reeding and the
 * recursion refinements. They only appear with genes past the signature, so the
 * main suite never reaches them (ADDENDUM-028).
 */
const border = (aspect: number, density: number, genome: BaseGenome = SIGNATURE_GENOME) =>
  buildEdgeBorder({ aspect, genome, density });

describe('corner fans', () => {
  it('adds ribs and arcs as the density rises', () => {
    const sparse = border(1.78, 0).specs.filter((spec) => spec.delay < 0.4 && spec.z <= -0.02);
    const dense = border(1.78, 1).specs.filter((spec) => spec.delay < 0.4 && spec.z <= -0.02);

    expect(sparse.length).toBeGreaterThan(0);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it('keeps every fan ray short enough to stay inside its quadrant', () => {
    const { specs } = border(2.4, 1, withGene(SIGNATURE_GENOME, 'rayReach', 1.6));

    for (const spec of specs.filter((item) => item.kind === 'ray')) {
      const [start, end] = spec.points;
      expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(0.6);
    }
  });

  it('adds ruler ribs between the primary fan ribs when recursion is on', () => {
    const off = border(1.78, 0.5, withGene(SIGNATURE_GENOME, 'fractalDepth', 0));
    const on = border(1.78, 0.5, withGene(SIGNATURE_GENOME, 'fractalDepth', 3));

    expect(on.specs.length).toBeGreaterThan(off.specs.length);
  });

  it('drops the recursion instead of drawing sub-pixel rays', () => {
    const shallow = border(1.78, 0, withGene(SIGNATURE_GENOME, 'fractalRatio', 0.1));

    expect(shallow.specs.some((spec) => spec.kind === 'ray' && spec.z < -0.03)).toBe(false);
  });
});

describe('reeding', () => {
  it('counts teeth from the wing gene and mirrors them on all four edges', () => {
    const base = border(1.78, 0.5);
    const winged = border(1.78, 0.5, withGene(SIGNATURE_GENOME, 'wingDelta', 4));
    const count = (specs: typeof base.specs) =>
      specs.filter((spec) => spec.kind === 'rule' && Math.abs(spec.z + 0.01) < 1e-9).length;

    expect(count(winged.specs)).toBe(count(base.specs) + 16);
  });

  it('subdivides the ticks when recursion is on', () => {
    const off = border(1.78, 1, withGene(SIGNATURE_GENOME, 'fractalDepth', 0));
    const on = border(1.78, 1, withGene(SIGNATURE_GENOME, 'fractalDepth', 2));
    const subdivision = (specs: typeof off.specs) =>
      specs.filter((spec) => spec.kind === 'rule' && Math.abs(spec.z + 0.02) < 1e-9).length;

    expect(subdivision(off.specs)).toBe(0);
    expect(subdivision(on.specs)).toBeGreaterThan(0);
  });

  it('draws a closed hairline just inside the rules', () => {
    const { specs } = border(1.78, 0.5);
    const hairline = specs.find((spec) => spec.closed && spec.width === 0.005);

    expect(hairline).toBeDefined();
    expect(hairline!.points).toHaveLength(4);
  });
});

describe('lattice proscenium', () => {
  it('converts every nine-slice rail into a toned, seeded rail', () => {
    const { specs, extentX, extentY } = buildLatticeProscenium(1.78, 0.5);

    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec.partDir).toBe(0);
      expect(spec.depth).toBeGreaterThan(0);
      // Degrees, quantised to whole numbers by the seed hash.
      expect(Number.isInteger(spec.brassAngle)).toBe(true);
      expect(spec.brassAngle).toBeGreaterThanOrEqual(0);
      expect(spec.brassAngle).toBeLessThan(360);
      expect(['frame', 'rule', 'reed', 'diamond']).toContain(spec.kind);
    }
    expect(extentX).toBeCloseTo(1.78, 1);
    expect(extentY).toBeCloseTo(1, 1);
  });

  it('is reached through the request pattern', () => {
    const lattice = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice', seed: 1925 });

    expect(lattice.specs).toEqual(buildLatticeProscenium(1.78, 0.5, 1925).specs);
  });

  it('clamps a wild aspect before building', () => {
    const wide = buildEdgeBorder({ aspect: 9, density: 0.5, pattern: 'lattice' });

    expect(wide.extentX).toBeCloseTo(3.2, 1);
  });
});

describe('viewport scale', () => {
  it('maps unit space onto the frustum height at a distance', () => {
    expect(viewportScaleAtDistance(10, Math.PI / 3)).toBeCloseTo(10 * Math.tan(Math.PI / 6), 6);
    expect(viewportScaleAtDistance(0, Math.PI / 2)).toBe(0);
  });
});
