import { describe, expect, it } from 'vitest';
import { buildEdgeBorder, buildLatticeProscenium } from './edgeBorder';
import { buildNineSlice } from '@/features/deco-lattice/model/nineSlice';
import { LAYER_TONES, brassAngleFor } from '@/features/deco-lattice/model/tone';

/**
 * The screen border's lattice pattern (ADDENDUM-021 §3.5 + §3.4). The geometry
 * is pure, so the proscenium is asserted here: inside the viewport, D2-exact,
 * clear in the middle, and costed — not "looks right in a browser".
 */
describe('buildLatticeProscenium', () => {
  it('stays inside the viewport for narrow, wide and ultra-wide', () => {
    for (const aspect of [0.5, 1.78, 3.2]) {
      const { specs, extentX, extentY } = buildLatticeProscenium(aspect, 0.6);
      expect(extentX).toBeLessThanOrEqual(aspect + 1e-9);
      expect(extentY).toBeLessThanOrEqual(1 + 1e-9);
      for (const spec of specs) {
        for (const point of spec.points) {
          expect(Math.abs(point.x)).toBeLessThanOrEqual(aspect + 1e-9);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it('keeps the aperture clear at every weight', () => {
    for (const density of [0, 0.5, 1]) {
      const { specs } = buildNineSlice({ hw: 2.4, hh: 1, density, level: 4 });
      const aperture = { hw: 2.4 - 0.3, hh: 1 - 0.3 };
      for (const spec of specs) {
        for (const point of spec.points) {
          expect(Math.abs(point.x) < aperture.hw - 1e-6 && Math.abs(point.y) < aperture.hh - 1e-6).toBe(false);
        }
      }
    }
  });

  it('maps the tutorial layers onto grammar kinds and tones', () => {
    const { specs } = buildLatticeProscenium(2.4, 0.6, 1925);
    const kinds = new Set(specs.map((spec) => spec.kind));
    expect(kinds.has('frame')).toBe(true);
    expect(specs.every((spec) => spec.depth >= 0.012)).toBe(true);

    const tones = new Set(specs.map((spec) => spec.tone));
    for (const tone of tones) expect(LAYER_TONES).toContain(tone);
    const angles = new Set(specs.map((spec) => spec.brassAngle));
    expect(angles.size).toBeLessThanOrEqual(4);
    for (const angle of angles) {
      expect([0, 1, 2, 3].map((layer) => brassAngleFor(1925, layer))).toContain(angle);
    }
  });

  it('stagger the draw-on by layer so the border builds outward to inward', () => {
    const { specs } = buildLatticeProscenium(2.4, 0.6);
    const delays = specs.map((spec) => spec.delay);
    expect(Math.min(...delays)).toBeLessThan(Math.max(...delays));
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.65);
  });

  it('is deterministic and seed-sensitive in the brass angles only', () => {
    const a = buildLatticeProscenium(2.4, 0.6, 1925);
    const b = buildLatticeProscenium(2.4, 0.6, 1925);
    const c = buildLatticeProscenium(2.4, 0.6, 7);
    expect(a).toEqual(b);
    expect(a.specs.map((spec) => spec.points)).toEqual(c.specs.map((spec) => spec.points));
    expect(a.specs.map((spec) => spec.brassAngle)).not.toEqual(c.specs.map((spec) => spec.brassAngle));
  });

  it('is reached through buildEdgeBorder with pattern: lattice', () => {
    const viaPattern = buildEdgeBorder({ aspect: 2.4, density: 0.6, pattern: 'lattice', seed: 1925 });
    expect(viaPattern).toEqual(buildLatticeProscenium(2.4, 0.6, 1925));
  });

  it('leaves the poster border untouched when no pattern is given', () => {
    const legacy = buildEdgeBorder({ aspect: 1.78, density: 0.5 });
    const poster = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'poster' });
    expect(legacy).toEqual(poster);
    expect(legacy.specs.every((spec) => spec.tone === undefined)).toBe(true);
  });

  it('adds ornament with weight', () => {
    expect(buildLatticeProscenium(2.4, 1).specs.length).toBeGreaterThan(
      buildLatticeProscenium(2.4, 0).specs.length
    );
  });
});

// Cases from PR #5's edge-border suite, adapted: the default seed, and a clear aperture on the
// proscenium itself (the case above checks the nine-slice builder it is made from).
describe('buildLatticeProscenium defaults and aperture', () => {
  it('uses the 1925 seed by default and changes the brass tilt with an explicit seed', () => {
    const byDefault = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice' });
    const explicit = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice', seed: 1925 });
    const other = buildEdgeBorder({ aspect: 1.78, density: 0.5, pattern: 'lattice', seed: 7 });

    expect(byDefault).toEqual(explicit);
    expect(other.specs).not.toEqual(byDefault.specs);
    expect(byDefault.specs.length).toBeGreaterThan(0);
  });

  it('keeps its own rails out of the clear middle at every weight', () => {
    for (const density of [0, 0.5, 1]) {
      const { specs } = buildLatticeProscenium(2.4, density);
      for (const spec of specs) {
        for (const point of spec.points) {
          expect(Math.abs(point.x) < 2.4 - 0.3 - 1e-6 && Math.abs(point.y) < 1 - 0.3 - 1e-6).toBe(false);
        }
      }
    }
  });

  it('reports the extents of the rails it returns', () => {
    const { specs, extentX, extentY } = buildLatticeProscenium(1.78, 0.5);

    expect(extentX).toBe(Math.max(...specs.flatMap((spec) => spec.points.map((p) => Math.abs(p.x)))));
    expect(extentY).toBe(Math.max(...specs.flatMap((spec) => spec.points.map((p) => Math.abs(p.y)))));
  });

  it('gives every rail a finite tone and angle', () => {
    for (const spec of buildLatticeProscenium(1.78, 0.5).specs) {
      expect(Number.isFinite(spec.tone)).toBe(true);
      expect(Number.isFinite(spec.brassAngle)).toBe(true);
    }
  });
});
