// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { sanitizeFlashPlan } from './motionPolicy';

describe('sanitizeFlashPlan dimming', () => {
  it('dims the fourth large flash inside a second instead of refusing it', () => {
    const segments = [0, 100, 200, 300].map((startMs) => ({ startMs, attackMs: 0, holdMs: 0, decayMs: 1, peak: 1 }));

    const plan = sanitizeFlashPlan(segments);

    expect(plan.map((segment) => segment.peak)).toEqual([1, 1, 1, plan[3].peak]);
    expect(plan[3].peak).toBeLessThan(1);
  });
});
