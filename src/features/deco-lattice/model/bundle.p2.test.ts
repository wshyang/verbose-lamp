// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { offsetSide } from './bundle';

describe('offsetSide', () => {
  it('tolerates zero-length and reversal segments without non-finite offsets', () => {
    const duplicate = offsetSide([{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.02);
    const reversal = offsetSide([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }], 0.02);
    expect([...duplicate, ...reversal].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});
