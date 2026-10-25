import { describe, expect, it } from 'vitest';
import { inWedge } from './symmetry';
import { traceWalks, type WalkOptions } from './walk';

const OPEN: WalkOptions = { seed: 1925, cell: 4, inner: 8, outer: 90, count: 6, minRun: 2 };

describe('traceWalks', () => {
  it('is deterministic for a seed and different across seeds', () => {
    expect(traceWalks(OPEN)).toEqual(traceWalks(OPEN));
    expect(traceWalks({ ...OPEN, seed: 1926 })).not.toEqual(traceWalks(OPEN));
  });

  it('keeps every walk inside the wedge annulus on the cell grid', () => {
    const walks = traceWalks(OPEN);
    expect(walks.length).toBeGreaterThan(0);
    for (const walk of walks) {
      expect(walk.length).toBeGreaterThanOrEqual(2);
      for (const point of walk) {
        expect(inWedge(point)).toBe(true);
        expect(Math.hypot(point.x, point.y)).toBeGreaterThanOrEqual(OPEN.inner);
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(OPEN.outer);
        expect(point.x % OPEN.cell).toBe(0);
        expect(point.y % OPEN.cell).toBe(0);
      }
    }
  });

  it('never lets two walks occupy the same cell', () => {
    const seen = new Set<string>();
    for (const walk of traceWalks(OPEN)) {
      for (const point of walk) {
        const key = `${point.x},${point.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('returns nothing when the annulus is too thin to start in', () => {
    // inner + 2 cells is past outer − 4 cells, so most starts land outside the ring.
    expect(traceWalks({ ...OPEN, inner: 100, outer: 110, count: 12 })).toEqual([]);
  });

  it('stops a walk that hits the far edge instead of throwing', () => {
    const tight = traceWalks({ seed: 7, cell: 4, inner: 20, outer: 26, count: 40, minRun: 1 });
    // Whatever survives is still a legal walk: two or more points, all inside.
    for (const walk of tight) {
      expect(walk.length).toBeGreaterThanOrEqual(2);
      for (const point of walk) expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(26);
    }
  });

  it('honours count = 0', () => {
    expect(traceWalks({ ...OPEN, count: 0 })).toEqual([]);
  });
});
