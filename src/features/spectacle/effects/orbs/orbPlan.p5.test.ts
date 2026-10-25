// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planOrbTransition } from './orbPlan';

describe('planOrbTransition degenerate tracks', () => {
  it('keeps the control point finite when a target sits on the origin', () => {
    const origin = { x: 0.5, y: 0.5 };
    const plan = planOrbTransition({ origin, pattern: [origin], direction: 'outward' });
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0].control).toEqual(origin);
  });
});
