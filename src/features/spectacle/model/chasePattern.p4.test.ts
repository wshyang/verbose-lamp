// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { chasePattern } from './chasePattern';

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
