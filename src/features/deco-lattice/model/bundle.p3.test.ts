// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { offsetSide } from './bundle';

describe('offsetSide at degenerate turns', () => {
  it('handles a segment with no direction and a 180° reversal', () => {
    const coincident = offsetSide([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }], 0.05);
    expect(coincident).toHaveLength(3);
    for (const point of coincident) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }

    const reversal = offsetSide([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], 0.05);
    expect(reversal).toHaveLength(3);
    for (const point of reversal) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});
