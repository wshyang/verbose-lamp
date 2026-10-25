import { describe, expect, it } from 'vitest';
import { chasePattern } from './chasePattern';

describe('chasePattern', () => {
  it('all-on lights every bulb', () => {
    for (let i = 0; i < 20; i += 1) expect(chasePattern(i, 3, 'all-on')).toBe(1);
  });

  it('chase moves the lit pair along the strand', () => {
    expect(chasePattern(0, 0, 'chase')).toBe(1);
    expect(chasePattern(1, 1, 'chase')).toBe(1);
    expect(chasePattern(4, 0, 'chase')).toBeLessThan(1);
  });

  it('alternate flips parity per frame and sparkle is deterministic', () => {
    expect(chasePattern(2, 0, 'alternate')).toBe(1);
    expect(chasePattern(2, 1, 'alternate')).toBeLessThan(1);
    expect(chasePattern(7, 9, 'sparkle')).toBe(chasePattern(7, 9, 'sparkle'));
    // hash01(0, 0) = 0 and hash01(0, 1) ≈ 0.768, either side of the 0.55 gate.
    expect(chasePattern(0, 0, 'sparkle')).toBe(0.2);
    expect(chasePattern(0, 1, 'sparkle')).toBe(1);
  });
});