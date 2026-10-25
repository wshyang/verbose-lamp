// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { clampSequenceTime } from './styleClamp';

describe('clampSequenceTime', () => {
  it('keeps time inside the 38 s sequence', () => {
    expect(clampSequenceTime(-5)).toBe(0);
    expect(clampSequenceTime(38)).toBe(37.999);
    expect(clampSequenceTime(12.5)).toBe(12.5);
  });
});
