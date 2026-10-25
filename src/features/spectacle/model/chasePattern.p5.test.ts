// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { chasePattern } from './chasePattern';

describe('chasePattern', () => {
  it('alternate flips parity per frame and sparkle is deterministic', () => {
    expect(chasePattern(2, 0, 'alternate')).toBe(1);
    expect(chasePattern(2, 1, 'alternate')).toBeLessThan(1);
    expect(chasePattern(7, 9, 'sparkle')).toBe(chasePattern(7, 9, 'sparkle'));
    // hash01(0, 0) = 0 and hash01(0, 1) ≈ 0.768, either side of the 0.55 gate.
    expect(chasePattern(0, 0, 'sparkle')).toBe(0.2);
    expect(chasePattern(0, 1, 'sparkle')).toBe(1);
  });
});
