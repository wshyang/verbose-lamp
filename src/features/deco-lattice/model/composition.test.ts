import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
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

describe('traceWalks', () => {
  it('advances after selecting the ±90° turn family for seed 9', () => {
    const walks = traceWalks({ seed: 9, cell: 0.015, inner: 0.58, outer: 0.9, count: 1, minRun: 2 });
    expect(walks).toHaveLength(1);
    const [start, afterTurn] = walks[0];
    // Initial heading is +y; seed 9's second roll lands in the ±90° family and
    // turns to -x, so the first run travels horizontally at constant y.
    expect(afterTurn.y).toBe(start.y);
    expect(afterTurn.x).toBeLessThan(start.x);
    expect(walks[0].length).toBeGreaterThanOrEqual(3);
  });

  it('takes the -90° turn (toward +x) for a seed whose rolls select it', () => {
    let seed: number | undefined;
    for (let candidate = 0; candidate < 1000 && seed === undefined; candidate += 1) {
      const rng = mulberry32(candidate);
      rng(); // startX
      if (rng() >= 0.85 && rng() >= 0.5) seed = candidate;
    }
    expect(seed).toBeDefined();
    const walks = traceWalks({ seed: seed as number, cell: 0.015, inner: 0.58, outer: 0.9, count: 1, minRun: 2 });
    expect(walks).toHaveLength(1);
    expect(walks[0][1].x).toBeGreaterThan(walks[0][0].x);
    expect(walks[0][1].y).toBe(walks[0][0].y);
  });

  it('is deterministic and stays inside the wedge annulus', () => {
    const opts = { seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 };
    const a = traceWalks(opts);
    expect(a.length).toBeGreaterThan(0);
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