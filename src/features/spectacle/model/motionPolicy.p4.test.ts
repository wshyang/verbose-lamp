// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { sanitizeFlashPlan } from './motionPolicy';

describe('sanitizeFlashPlan', () => {
  it('leaves a small flash untouched', () => {
    const plan = sanitizeFlashPlan([{ startMs: 0, attackMs: 90, holdMs: 0, decayMs: 100, peak: 0.4 }]);
    expect(plan[0].peak).toBe(0.4);
  });
});
