// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planSpin } from './spin';

describe('positionAt bounds', () => {
  it('pins both ends of the timeline, so a late or rewound clock cannot overshoot', () => {
    const plan = planSpin({ startP: 3.5, winnerIndex: 2, n: 8 });

    expect(plan.positionAt(-5000)).toBe(3.5);
    expect(plan.positionAt(0)).toBe(3.5);
    expect(plan.positionAt(plan.durationMs)).toBe(plan.endP);
    expect(plan.positionAt(plan.durationMs + 5000)).toBe(plan.endP);
  });
});
