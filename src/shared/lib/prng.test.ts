import { describe, expect, it } from 'vitest';
import { createPrng } from './prng';
import { mulberry32 } from './random';

describe('createPrng (ADDENDUM-022 §0.1)', () => {
  it('produces the known first five values for seed 1920', () => {
    const random = createPrng(1920);
    expect([random(), random(), random(), random(), random()]).toEqual([
      0.93226561136543751, 0.61730704526416957, 0.57980510056950152,
      0.077896282309666276, 0.76265868172049522,
    ]);
  });

  it('is the shared mulberry32 stream', () => {
    const a = createPrng(1925);
    const b = mulberry32(1925);
    for (let i = 0; i < 25; i += 1) expect(a()).toBe(b());
  });

  it('two instances give the same sequence, always in [0, 1)', () => {
    const a = createPrng(7);
    const b = createPrng(7);
    for (let i = 0; i < 100; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('different seeds give different streams', () => {
    expect(createPrng(1920)()).not.toBe(createPrng(1921)());
  });
});
