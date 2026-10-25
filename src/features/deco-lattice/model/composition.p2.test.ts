// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { traceWalks } from './walk';
import { mulberry32 } from '@/shared/lib/random';

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
