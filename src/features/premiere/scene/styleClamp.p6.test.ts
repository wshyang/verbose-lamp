// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { TOTAL_SEQUENCE_DURATION } from '../data/sequence';
import { LAST_FRAME_EPSILON, clampSequenceTime } from './styleClamp';

/** Both renderers clamp through here, so these are the numbers they must agree on. */
describe('clampSequenceTime', () => {
  it('holds the film between its first frame and one millisecond short of its last', () => {
    expect(clampSequenceTime(-4)).toBe(0);
    expect(clampSequenceTime(0)).toBe(0);
    expect(clampSequenceTime(12.5)).toBe(12.5);
    expect(clampSequenceTime(TOTAL_SEQUENCE_DURATION)).toBeCloseTo(
      TOTAL_SEQUENCE_DURATION - LAST_FRAME_EPSILON,
      9
    );
    expect(clampSequenceTime(999)).toBeLessThan(TOTAL_SEQUENCE_DURATION);
  });
});
