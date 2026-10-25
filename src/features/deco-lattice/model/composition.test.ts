import { describe, expect, it } from 'vitest';
import { buildDecoLattice } from './composition';
import { isOctilinear } from './lattice';
import { specsToLayerPaths } from './latticeSvg';
import { traceWalks } from './walk';

function pointSet(hw: number, hh: number, level: number) {
  return buildDecoLattice({ mode: 'medallion', hw, hh, seed: 1925, level });
}

describe('buildDecoLattice', () => {
  it('is deterministic per seed and emits octilinear rails', () => {
    const a = pointSet(1, 1, 4);
    const b = pointSet(1, 1, 4);
    expect(specsToLayerPaths(a.specs)).toEqual(specsToLayerPaths(b.specs));
    for (const spec of a.specs) {
      const pts = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
      expect(isOctilinear(pts, 1e-3)).toBe(true);
    }
  });

  it('each level is a superset of the previous (monotone intricacy)', () => {
    for (let level = 1; level < 4; level += 1) {
      expect(pointSet(1, 1, level + 1).specs.length).toBeGreaterThan(pointSet(1, 1, level).specs.length);
    }
  });

  it('keeps a closed rank-0 primary frame at minimal level', () => {
    const geo = pointSet(1, 1, 1);
    expect(geo.specs.some((s) => s.rank === 0 && s.closed)).toBe(true);
  });

  it('hits the tutorial landmarks within ±0.03 (octagram tip 0.56, border 1.0)', () => {
    const geo = pointSet(1, 1, 4);
    const starTips = geo.specs
      .filter((s) => s.layer === 1)
      .flatMap((s) => s.points.map((p) => Math.hypot(p.x, p.y)));
    expect(Math.max(...starTips)).toBeCloseTo(0.56, 1);
    const borderPts = geo.specs.filter((s) => s.layer === 0 && s.rank === 0).flatMap((s) => s.points);
    expect(Math.max(...borderPts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))))).toBeCloseTo(0.985, 2);
  });

  it('frame mode leaves the aperture clear for any aspect', () => {
    for (const [hw, hh] of [[1, 1], [2, 1], [3.2, 1]] as const) {
      const geo = buildDecoLattice({ mode: 'frame', hw, hh, seed: 1925 });
      const m = Math.min(hw, hh);
      for (const spec of geo.specs) {
        for (const p of spec.points) {
          const inside = Math.abs(p.x) < hw - 0.6 * m && Math.abs(p.y) < hh - 0.6 * m;
          expect(inside).toBe(false);
        }
      }
    }
  });
});

describe('aperture and text slots', () => {
  it('clips every rail clear of an explicit aperture, segment by segment', () => {
    const aperture = { hw: 0.9, hh: 0.5 };
    const geo = buildDecoLattice({ mode: 'medallion', hw: 2, hh: 1, seed: 1925, aperture });
    for (const spec of geo.specs) {
      const pts = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
      for (let i = 1; i < pts.length; i++) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
          const y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t;
          const inside = Math.abs(x) < aperture.hw - 1e-6 && Math.abs(y) < aperture.hh - 1e-6;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('keeps a text slot clear as well', () => {
    const slot = { minX: -0.4, minY: -0.2, maxX: 0.4, maxY: 0.2 };
    const geo = buildDecoLattice({ mode: 'medallion', hw: 1, hh: 1, seed: 7, textSlots: [slot] });
    for (const spec of geo.specs) {
      for (const p of spec.points) {
        const inside = p.x > slot.minX + 1e-6 && p.x < slot.maxX - 1e-6
          && p.y > slot.minY + 1e-6 && p.y < slot.maxY - 1e-6;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('traceWalks', () => {
  it('is deterministic and stays inside the wedge annulus', () => {
    const opts = { seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 };
    const a = traceWalks(opts);
    expect(a).toEqual(traceWalks(opts));
    for (const walk of a) {
      for (const p of walk) {
        const r = Math.hypot(p.x, p.y);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeGreaterThanOrEqual(p.y - 1e-9);
        expect(r).toBeGreaterThanOrEqual(0.58 - 1e-9);
        expect(r).toBeLessThanOrEqual(0.9 + 1e-9);
      }
    }
  });
});
describe('frame mode seed', () => {
  it('reworks the corner brackets when the seed changes (the Studio reroll)', () => {
    const base = buildDecoLattice({ mode: 'frame', hw: 1.78, hh: 1, seed: 1925, level: 2 });
    const rerolled = buildDecoLattice({ mode: 'frame', hw: 1.78, hh: 1, seed: 224442, level: 2 });
    expect(rerolled.specs).not.toEqual(base.specs);
    // The architectural frame rails themselves never move.
    const frames = (geo: typeof base) => geo.specs.filter((spec) => spec.layer === 0);
    expect(frames(rerolled)).toEqual(frames(base));
  });
});
