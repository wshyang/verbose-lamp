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
describe('sparkle mode', () => {
  it('lights a bulb only when the hash crosses the threshold', () => {
    const seen = new Set<number>();
    for (let bulb = 0; bulb < 12 && seen.size < 2; bulb += 1) {
      for (let frame = 0; frame < 12; frame += 1) seen.add(chasePattern(bulb, frame, 'sparkle'));
    }
    // Both a lit bulb (1) and a dim one (0.2) show up as the hash changes.
    expect([...seen].sort()).toEqual([0.2, 1]);
  });
});
