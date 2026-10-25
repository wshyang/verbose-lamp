// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planSpin } from './spin';

describe('planSpin before the start', () => {
  it('holds the start position at and before t = 0', () => {
    const profile = planSpin({ startP: 4.2, winnerIndex: 3, n: 30 });
    expect(profile.positionAt(0)).toBe(4.2);
    expect(profile.positionAt(-100)).toBe(4.2);
  });
});
