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
  });
});
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
