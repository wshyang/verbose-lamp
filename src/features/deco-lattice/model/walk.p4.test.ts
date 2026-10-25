// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { traceWalks, type WalkOptions } from './walk';
import { inWedge } from './symmetry';

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
describe('turn weighting', () => {
  it('takes straight runs as well as turns across seeds', () => {
    // The straight branch (roll < 0.55) must be reachable: scan a few seeds and
    // look for a step that keeps the same heading.
    const headings = new Set<string>();
    let straight = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const walk of traceWalks({ ...OPEN, seed })) {
        for (let i = 1; i < walk.length - 1; i += 1) {
          const before = { x: walk[i].x - walk[i - 1].x, y: walk[i].y - walk[i - 1].y };
          const after = { x: walk[i + 1].x - walk[i].x, y: walk[i + 1].y - walk[i].y };
          const norm = (v: { x: number; y: number }) => `${Math.sign(v.x)},${Math.sign(v.y)}`;
          headings.add(norm(after));
          if (norm(before) === norm(after)) straight += 1;
        }
      }
    }
    expect(straight).toBeGreaterThan(0);
    expect(headings.size).toBeGreaterThan(1);
  });
});
