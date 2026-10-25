import { describe, expect, it } from 'vitest';
import { goldenDigest, normaliseNumbers } from './digest';

describe('normaliseNumbers', () => {
  it('rounds engine noise away at six decimals', () => {
    expect(normaliseNumbers(0.307883852365990917654)).toBe(0.307884);
    expect(normaliseNumbers(-1.0352746588944859)).toBe(-1.035275);
  });

  it('leaves integers, strings and booleans untouched', () => {
    expect(normaliseNumbers({ count: 3, label: 'peony', green: true })).toEqual({
      count: 3,
      label: 'peony',
      green: true,
    });
  });

  it('walks arrays and nested objects', () => {
    expect(normaliseNumbers([{ speed: 1.23456789 }, [2.9999999]])).toEqual([{ speed: 1.234568 }, [3]]);
  });

  it('passes null and undefined through', () => {
    expect(normaliseNumbers(null)).toBeNull();
    expect(normaliseNumbers(undefined)).toBeUndefined();
  });
});

describe('goldenDigest', () => {
  it('ignores last-place engine differences', () => {
    const a = { dx: Math.cos(0.1), dy: Math.sin(0.2), n: 2 };
    const b = { dx: Math.cos(0.1) + 1e-16, dy: Math.sin(0.2) - 1e-16, n: 2 };
    expect(goldenDigest(a)).toEqual(goldenDigest(b));
  });

  it('still catches a real change', () => {
    expect(goldenDigest({ speed: 0.34 })).not.toEqual(goldenDigest({ speed: 0.35 }));
  });

  it('reports the normalised JSON length', () => {
    expect(goldenDigest({ a: 1.111111119 })).toEqual({ length: 14, hash: expect.any(String) });
  });
});
