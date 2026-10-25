import { describe, expect, it, vi } from 'vitest';
import { hash01, mulberry32, randomIndex } from './random';

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
describe('randomIndex', () => {
  it('maps a filled buffer into the requested range', () => {
    expect(randomIndex(7, () => new Uint32Array([20]))).toBe(6);
    expect(randomIndex(1, () => new Uint32Array([0]))).toBe(0);
  });

  it('asks the caller for one word of entropy', () => {
    const fill = vi.fn((buffer: Uint32Array) => buffer);
    randomIndex(3, fill);
    expect(fill).toHaveBeenCalledWith(expect.any(Uint32Array));
    expect(fill.mock.calls[0][0]).toHaveLength(1);
  });
});
