// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { chasePattern } from './chasePattern';

describe('sparkle bulbs that stay dark', () => {
  it('dims a bulb whenever the hash lands at or below the threshold', () => {
    const lit: number[] = [];
    const dim: number[] = [];
    for (let bulb = 0; bulb < 40; bulb += 1) {
      const value = chasePattern(bulb, 7, 'sparkle');
      (value === 1 ? lit : dim).push(value);
    }
    expect(lit.length).toBeGreaterThan(0);
    expect(dim.length).toBeGreaterThan(0);
    expect(dim.every((value) => value === 0.2)).toBe(true);
  });
});
