// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { offsetSide } from './bundle';

describe('offsetSide degenerate segments', () => {
  it('offsets through a repeated point without producing NaNs', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const off = offsetSide(line, 0.02);
    expect(off).toHaveLength(4);
    for (const p of off) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('survives a 180° reversal where the mitre direction cancels out', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }];
    const off = offsetSide(line, 0.02);
    expect(off[1]).toEqual({ x: 1, y: 0 }); // no offset direction → the vertex stays put
    for (const p of off) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
