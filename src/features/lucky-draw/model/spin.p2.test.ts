// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planSpin } from './spin';

describe('planSpin', () => {
  it('holds the start position at and before time zero', () => {
    const profile = planSpin({ startP: 12.5, winnerIndex: 3, n: 20 });
    expect(profile.positionAt(0)).toBe(12.5);
    expect(profile.positionAt(-250)).toBe(12.5);
  });
});
