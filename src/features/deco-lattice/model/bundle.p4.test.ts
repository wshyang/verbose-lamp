// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { offsetSide } from './bundle';

describe('offsetSide degenerate input', () => {
  it('survives a repeated point', () => {
    const off = offsetSide([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], 0.02);
    expect(off).toHaveLength(3);
    for (const point of off) expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  });

  it('clamps a full reversal instead of blowing up on a zero-length bisector', () => {
    const off = offsetSide([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], 0.02);
    expect(off).toHaveLength(3);
    // The 180° bisector has no direction, so the vertex stays put rather than
    // being thrown to infinity.
    expect(off[1]).toEqual({ x: 1, y: 0 });
  });
});
