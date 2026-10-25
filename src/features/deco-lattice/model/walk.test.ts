import { describe, expect, it } from 'vitest';
import type { Pt } from './lattice';
import { nextDir, stepRun, traceWalks, type WalkOptions } from './walk';

/**
 * `stepRun` is the walker's step engine and `traceWalks` the seeded walk that uses
 * it (ADDENDUM-021 §3.4). Until ADDENDUM-031 every walk stalled on its first turn:
 * the engine reserved a 3×3 halo around each cell it entered, and `isFree` then
 * rejected the walker's own neighbours. The reservation now happens once, when a
 * walk ends, so these cases can assert motion *and* clearance.
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

const MEDALLION = { seed: 1925, cell: 0.015, inner: 0.58, outer: 0.9, count: 10, minRun: 2 } as const;

const start: Pt = { x: 0.4, y: 0.2 };

const chebyshev = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('stepRun', () => {
  it('advances one whole cell per step along the chosen octilinear direction', () => {
    const path = stepRun(start, 2, 3, options(), new Set());

    expect(path).toEqual([
      { x: 0.4, y: 0.25 },
      { x: 0.4, y: 0.3 },
      { x: 0.4, y: 0.35 },
    ]);
  });

  it('does not reserve the cells it enters, so a walk cannot wall itself in', () => {
    const opts = options();
    const occupied = new Set<string>();

    const first = stepRun(start, 2, 3, opts, occupied);
    const again = stepRun(start, 2, 3, opts, occupied);

    expect(occupied.size).toBe(0);
    expect(again).toEqual(first);
  });

  it('still refuses cells another walk has claimed', () => {
    const opts = options();
    // Keys are rounded to 1e-4, as `reserve` writes them.
    const occupied = new Set(['4000,2500']);

    expect(stepRun(start, 2, 3, opts, occupied)).toEqual([]);
  });

  it('stops at the first cell that leaves the annulus', () => {
    const opts = options({ inner: 0.2, outer: 0.62 });

    // Straight up from (0.4, 0.2): the walk dies at the wedge edge (x = y) and
    // never gets near the outer radius, so this pins the wedge, not the ring.
    const path = stepRun({ x: 0.4, y: 0.2 }, 2, 8, opts, new Set());

    expect(path.length).toBe(4); // y = 0.25 … 0.40; y = 0.45 crosses x = y
    expect(path.at(-1)?.x).toBeCloseTo(0.4, 9);
    expect(path.at(-1)?.y).toBeCloseTo(0.4, 9); // floating point, one cell at a time
  });

  it('stops at the outer radius', () => {
    const opts = options({ inner: 0.1, outer: 0.62 });

    // Along +x from the axis there is no wedge edge to stop us.
    const path = stepRun({ x: 0.4, y: 0 }, 0, 8, opts, new Set());

    expect(path.length).toBe(4); // r = 0.45 … 0.60; 0.65 is outside
    for (const p of path) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(opts.outer);
  });

  it('stops at the wedge edge when the next cell would cross y = 0', () => {
    // Direction 6 is -y: from the axis the next cell is outside the wedge.
    expect(stepRun({ x: 0.6, y: 0 }, 6, 4, options({ inner: 0.1, outer: 0.95 }), new Set())).toEqual([]);
  });

  it('returns an empty path for a zero-length run', () => {
    expect(stepRun(start, 2, 0, options(), new Set())).toEqual([]);
  });
});

describe('traceWalks', () => {
  it('draws walks again, inside the wedge annulus', () => {
    const walks = traceWalks(MEDALLION);

    expect(walks.length).toBeGreaterThan(0);
    expect(walks.length).toBeLessThanOrEqual(MEDALLION.count);
    for (const walk of walks) {
      expect(walk.length).toBeGreaterThanOrEqual(2);
      for (const p of walk) {
        const r = Math.hypot(p.x, p.y);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeGreaterThanOrEqual(p.y - 1e-9);
        expect(r).toBeGreaterThanOrEqual(MEDALLION.inner - 1e-9);
        expect(r).toBeLessThanOrEqual(MEDALLION.outer + 1e-9);
      }
    }
  });

  it('is deterministic per seed, and a different seed walks differently', () => {
    const first = traceWalks(MEDALLION);

    expect(traceWalks(MEDALLION)).toEqual(first);
    expect(traceWalks({ ...MEDALLION, seed: 77 })).not.toEqual(first);
  });

  it('walks octilinearly between waypoints, a whole number of cells per run', () => {
    // `traceWalks` yields waypoints, one per turn: `minRun`–`minRun + 2` cells in one
    // of the eight lattice directions (0°, 45° or 90°), never a diagonal shortcut.
    // A run that meets an obstacle stops short, so it may be as short as one cell.
    for (const walk of traceWalks(MEDALLION)) {
      for (let i = 1; i < walk.length; i += 1) {
        const dx = Math.abs(walk[i].x - walk[i - 1].x);
        const dy = Math.abs(walk[i].y - walk[i - 1].y);
        const cellsX = dx / MEDALLION.cell;
        const cellsY = dy / MEDALLION.cell;
        expect(Math.round(cellsX)).toBeCloseTo(cellsX, 6);
        expect(Math.round(cellsY)).toBeCloseTo(cellsY, 6);
        // A pure axis run, or a true 45° run with equal cell counts.
        if (cellsX > 0 && cellsY > 0) expect(cellsX).toBeCloseTo(cellsY, 6);
        const run = Math.max(cellsX, cellsY);
        expect(run).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(run).toBeLessThanOrEqual(MEDALLION.minRun + 2 + 1e-9);
      }
    }
  });

  it('keeps a one-cell halo between different walks', () => {
    const walks = traceWalks({ ...MEDALLION, count: 24 });

    for (let a = 0; a < walks.length; a += 1) {
      for (let b = a + 1; b < walks.length; b += 1) {
        for (const p of walks[a]) {
          for (const q of walks[b]) {
            expect(chebyshev(p, q)).toBeGreaterThan(MEDALLION.cell * 1.5);
          }
        }
      }
    }
  });

  it('returns nothing when no start lands inside the annulus', () => {
    // `outer < inner` admits no legal start cell, so every attempt is skipped.
    expect(traceWalks({ seed: 3, cell: 0.05, inner: 0.9, outer: 0.3, count: 3, minRun: 2 })).toEqual([]);
  });
});

describe('nextDir', () => {
  const rolls = (...values: number[]) => {
    const queue = [...values];
    return () => queue.shift() ?? 0;
  };

  it.each([
    ['straight below 0.55', [0.2], 0],
    ['+45° on the low half of the 0.3 band', [0.6, 0.2], 1],
    ['-45° on the high half of the 0.3 band', [0.6, 0.8], -1],
    ['+90° on the low half of the 0.15 band', [0.9, 0.2], 2],
    ['-90° on the high half of the 0.15 band', [0.9, 0.8], -2],
  ] as const)('turns %s', (_label, values, turn) => {
    expect(nextDir(2, rolls(...values))).toBe((2 + turn + 8) % 8);
  });

  it('wraps around the eight directions', () => {
    expect(nextDir(7, rolls(0.6, 0.2))).toBe(0);
    expect(nextDir(0, rolls(0.6, 0.8))).toBe(7);
  });
});
