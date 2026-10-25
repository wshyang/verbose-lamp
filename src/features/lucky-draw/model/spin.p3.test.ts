// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planSpin } from './spin';

describe('spin profile at the edges', () => {
  it('holds the start position before the drum moves', () => {
    const profile = planSpin({ startP: 0.2, winnerIndex: 7, n: 30 });
    expect(profile.positionAt(0)).toBe(0.2);
    expect(profile.positionAt(-50)).toBe(0.2);
    expect(profile.velocityAt(0)).toBe(0);
  });
});
