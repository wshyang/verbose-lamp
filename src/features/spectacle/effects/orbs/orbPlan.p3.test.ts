// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planOrbTransition } from './orbPlan';

describe('a target sitting on the origin', () => {
  it('falls back to a unit chord length so the arc stays finite', () => {
    const origin = { x: 0.5, y: 0.5 };
    const plan = planOrbTransition({ origin, pattern: [origin], direction: 'outward' });
    expect(plan.tracks).toHaveLength(1);
    for (const value of Object.values(plan.tracks[0].control)) expect(Number.isFinite(value)).toBe(true);
  });
});
