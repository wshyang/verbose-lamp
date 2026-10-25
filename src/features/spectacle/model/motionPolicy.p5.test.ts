// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { sanitizeFlashPlan } from './motionPolicy';

describe('sanitizeFlashPlan small flashes', () => {
  it('lets a sub-threshold flash through without spending the large-flash budget', () => {
    const seg = (startMs: number, peak: number) => ({
      startMs, attackMs: 80, holdMs: 0, decayMs: 100, peak,
    });
    const plan = sanitizeFlashPlan([seg(0, 0.6), seg(100, 1), seg(200, 1), seg(300, 1), seg(400, 1)]);
    expect(plan.map((segment) => segment.peak)).toEqual([0.6, 1, 1, 1, 0.3]);
  });
});
