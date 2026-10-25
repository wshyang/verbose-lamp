import { describe, expect, it } from 'vitest';
import type { Pt } from './lattice';
import { stepRun, traceWalks, type WalkOptions } from './walk';

/**
 * `stepRun` is the walker's single step engine. The composite `traceWalks` reserves a
 * 3×3 footprint around every visited cell, so a seeded walk can never take its first
 * step (see ADDENDUM-029 §6); these cases drive the engine directly with an empty
 * occupancy set so the advancing and walled-in paths are both pinned down.
 */
const options = (overrides: Partial<WalkOptions> = {}): WalkOptions => ({
  seed: 1925,
  cell: 0.05,
  inner: 0.2,
  outer: 0.9,
  count: 4,
  minRun: 2,
  ...overrides,
});

const start: Pt = { x: 0.4, y: 0.2 };

describe('stepRun', () => {
  it('advances along the chosen octilinear direction, then is walled in', () => {
    // The engine reserves each cell it enters, and a reservation covers the full 3×3
    // neighbourhood — so a run currently stops after one cell. See §6 of the record.
    const opts = options();
    const occupied = new Set<string>();

    const path = stepRun(start, 2, 3, opts, occupied);

    expect(path).toEqual([{ x: 0.4, y: 0.25 }]);
  });

  it('reserves the cells it enters, so a second walker cannot share them', () => {
    const opts = options();
    const occupied = new Set<string>();

    stepRun(start, 2, 1, opts, occupied);
    const follower = stepRun(start, 2, 1, opts, occupied);

    expect(follower).toEqual([]);
  });

  it('stops at the first cell that leaves the annulus', () => {
    const opts = options({ inner: 0.2, outer: 0.46 });
    const occupied = new Set<string>();

    // Straight up from r = 0.447: the next cell crosses outer = 0.46.
    const path = stepRun({ x: 0.4, y: 0.2 }, 2, 5, opts, occupied);

    expect(path.length).toBeLessThan(5);
    for (const p of path) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(opts.outer);
  });

  it('stops at the wedge edge when the next cell would cross y = 0', () => {
    const opts = options({ inner: 0.1, outer: 0.95 });

    // Direction 6 is -y: from the axis the next cell is outside the wedge.
    expect(stepRun({ x: 0.6, y: 0 }, 6, 4, opts, new Set())).toEqual([]);
  });

  it('returns an empty path for a zero-length run', () => {
    expect(stepRun(start, 2, 0, options(), new Set())).toEqual([]);
  });
});

describe('traceWalks', () => {
  it('returns no walks at the shipped reservation footprint', () => {
    // Pinned behaviour, not an endorsement: the 3×3 reservation walls the walker in
    // immediately, so medallion mode currently draws no walk strands.
    const walks = traceWalks({ seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 });

    expect(walks).toEqual([]);
  });

  it('skips starts that are already outside the annulus', () => {
    const walks = traceWalks({ seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 3, minRun: 2 });

    expect(walks).toHaveLength(0);
  });
});
