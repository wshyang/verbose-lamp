import { describe, expect, it } from 'vitest';
import { createPrng, DUST_SEED } from './prng';

describe('createPrng', () => {
  it('produces the recorded sequence for the dust seed', () => {
    const random = createPrng(DUST_SEED);
    expect(Array.from({ length: 5 }, () => random())).toEqual([
      0.9322656113654375,
      0.6173070452641696,
      0.5798051005695015,
      0.07789628230966628,
      0.7626586817204952,
    ]);
  });

  it('stays inside [0, 1)', () => {
    const random = createPrng(1925);
    for (let i = 0; i < 500; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives two instances the same sequence and different seeds different ones', () => {
    const a = createPrng(1925);
    const b = createPrng(1925);
    const c = createPrng(1926);
    for (let i = 0; i < 20; i += 1) expect(a()).toBe(b());
    expect(createPrng(1925)()).not.toBe(c());
  });
});
