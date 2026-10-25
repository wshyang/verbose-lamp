import { describe, expect, it } from 'vitest';
import { LATTICE_DEFAULT_SEED, nextPatternSeed } from './patternSeed';

describe('nextPatternSeed', () => {
  it('defaults an absent seed to the Gatsby year seed', () => {
    expect(LATTICE_DEFAULT_SEED).toBe(1925);
    expect(nextPatternSeed(undefined)).toBe(224442);
  });

  it('advances a seed deterministically inside the LCG modulus', () => {
    expect(nextPatternSeed(0)).toBe(49297);
    expect(nextPatternSeed(1925)).toBe(nextPatternSeed(undefined));
    let seed = 1925;
    for (let i = 0; i < 50; i += 1) {
      const next = nextPatternSeed(seed);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(233280);
      expect(next).not.toBe(seed);
      seed = next;
    }
  });
});
