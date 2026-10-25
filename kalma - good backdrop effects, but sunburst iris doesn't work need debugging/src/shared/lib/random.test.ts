import { describe, expect, it } from 'vitest';
import { hash01, mulberry32 } from './random';

describe('mulberry32', () => {
  it('is deterministic per seed', () => {
    const a = mulberry32(1925);
    const b = mulberry32(1925);
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });

  it('differs across seeds and stays in [0,1)', () => {
    const a = mulberry32(1925);
    const b = mulberry32(1926);
    let same = 0;
    for (let i = 0; i < 100; i += 1) {
      const x = a();
      const y = b();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === y) same += 1;
    }
    expect(same).toBeLessThan(5);
  });
});

describe('hash01', () => {
  it('is stable and bounded', () => {
    expect(hash01(7, 13)).toBe(hash01(7, 13));
    for (let i = 0; i < 200; i += 1) {
      const v = hash01(i, i * 31);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});