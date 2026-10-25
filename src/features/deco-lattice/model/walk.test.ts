import { describe, expect, it } from 'vitest';
import { OCTI_DIRS } from './lattice';
import { traceWalks } from './walk';

/**
 * Unit-cell annulus for the geometry assertions below; the delivered medallion
 * annulus (inner 0.58·m, outer 0.9·m, cell 0.015·m) is exercised in its own case at the
 * end of this file. ADDENDUM-025 records the self-margin bug that used to make
 * `traceWalks` return nothing at all.
 */
const reachable = { seed: 1925, cell: 1, inner: 0.5, outer: 12, count: 6, minRun: 2 } as const;

describe('traceWalks in a reachable annulus', () => {
  it('is deterministic and returns connected walks', () => {
    const walks = traceWalks(reachable);
    expect(walks.length).toBeGreaterThan(0);
    expect(traceWalks(reachable)).toEqual(walks);
    for (const walk of walks) {
      expect(walk.length).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < walk.length; index += 1) {
        // A recorded vertex closes a whole run, so a leg is a positive whole number of cells.
        const step = Math.hypot(walk[index].x - walk[index - 1].x, walk[index].y - walk[index - 1].y);
        const cells = step / reachable.cell;
        expect(cells).toBeGreaterThan(0);
        expect(Number.isInteger(cells) || Math.abs(cells - Math.SQRT2 * Math.round(cells / Math.SQRT2)) < 1e-9).toBe(
          true,
        );
      }
    }
  });

  it('uses only the eight octilinear directions', () => {
    const allowed = OCTI_DIRS.map(([x, y]) => `${x},${y}`);
    for (const walk of traceWalks(reachable)) {
      for (let index = 1; index < walk.length; index += 1) {
        const dx = Math.sign(walk[index].x - walk[index - 1].x);
        const dy = Math.sign(walk[index].y - walk[index - 1].y);
        expect(allowed).toContain(`${dx},${dy}`);
      }
    }
  });

  it('stops on the obstacle grid instead of overlapping earlier walks', () => {
    const many = traceWalks({ ...reachable, count: 24, outer: 7 });
    expect(many.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const walk of many) {
      for (const point of walk) {
        const key = `${point.x},${point.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('gives up when the first cell is already outside the annulus', () => {
    expect(traceWalks({ ...reachable, inner: 30, outer: 14 })).toHaveLength(0);
    expect(traceWalks({ ...reachable, inner: 0, outer: 0.5 })).toHaveLength(0);
  });

  it('caps a run that is boxed in by the annulus edge', () => {
    const boxed = traceWalks({ ...reachable, count: 4, minRun: 40, inner: 0.5, outer: 3 });
    for (const walk of boxed) {
      for (const point of walk) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(3 + 1e-9);
      }
    }
  });
});

describe('traceWalks across seeds', () => {
  it('turns both ways at ±45° and ±90° over many seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const walk of traceWalks({ ...reachable, seed, count: 4 })) {
        for (let index = 2; index < walk.length; index += 1) {
          const first = [walk[index - 1].x - walk[index - 2].x, walk[index - 1].y - walk[index - 2].y];
          const second = [walk[index].x - walk[index - 1].x, walk[index].y - walk[index - 1].y];
          seen.add(`${Math.sign(first[0])},${Math.sign(first[1])}->${Math.sign(second[0])},${Math.sign(second[1])}`);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('traceWalks in the delivered medallion annulus', () => {
  const medallion = { seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 9, minRun: 2 } as const;

  it('starts walks inside the annulus the composition actually asks for', () => {
    const walks = traceWalks(medallion);
    expect(walks.length).toBeGreaterThan(0);
    for (const walk of walks) {
      expect(walk.length).toBeGreaterThanOrEqual(2);
      for (const point of walk) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius).toBeGreaterThanOrEqual(medallion.inner);
        expect(radius).toBeLessThanOrEqual(medallion.outer);
      }
    }
  });
});
