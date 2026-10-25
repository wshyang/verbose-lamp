import { describe, expect, it } from 'vitest';
import { boxBlur } from './blur';

const mean = (values: Float32Array): number => values.reduce((total, value) => total + value, 0) / values.length;

describe('boxBlur', () => {
  it('returns an equal copy, not the same array, when the radius is zero', () => {
    const values = Float32Array.from([0, 1, 0, 1]);
    const out = boxBlur(values, { width: 2, height: 2, radius: 0 });

    expect(out).toEqual(values);
    expect(out).not.toBe(values);
  });

  it('returns an equal copy when the buffer does not match the stated shape', () => {
    const values = Float32Array.from([1, 2, 3, 4, 5]);
    const out = boxBlur(values, { width: 2, height: 2, radius: 1 });

    expect(out).toEqual(values);
    expect(out).not.toBe(values);
  });

  it('floors a fractional radius', () => {
    const values = Float32Array.from([0, 0, 0, 9, 0, 0, 0, 0, 0]);

    expect(boxBlur(values, { width: 3, height: 3, radius: 1.9 })).toEqual(
      boxBlur(values, { width: 3, height: 3, radius: 1 }),
    );
  });

  it('spreads a single bright pixel without changing the mean', () => {
    const values = new Float32Array(25);
    values[12] = 1;
    const blurred = boxBlur(values, { width: 5, height: 5, radius: 1 });

    expect(blurred[12]).toBeLessThan(1);
    expect(blurred[11]).toBeGreaterThan(0);
    expect(mean(blurred)).toBeCloseTo(mean(values), 6);
  });

  it('leaves a flat field flat', () => {
    const flat = new Float32Array(12).fill(0.4);

    for (const value of boxBlur(flat, { width: 4, height: 3, radius: 2 })) {
      expect(value).toBeCloseTo(0.4, 6);
    }
  });
});
