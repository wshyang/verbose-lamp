import { describe, expect, it } from 'vitest';
import { applyClarity, applyLevels, boxBlur, toLuminance } from './tone';
import type { RgbaImage } from './types';

function average(values: Float32Array): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function variance(values: Float32Array): number {
  const mean = average(values);
  return average(Float32Array.from(values, (value) => (value - mean) ** 2));
}

describe('tone operations', () => {
  it('uses Rec. 709 luminance and ignores alpha', () => {
    const image: RgbaImage = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 18, 0, 0, 255, 255]),
    };

    expect(Array.from(toLuminance(image))).toEqual([
      expect.closeTo(0.2126, 4),
      expect.closeTo(0.7152, 4),
      expect.closeTo(0.0722, 4),
    ]);
  });

  it('clamps levels and applies gamma after the black and white points', () => {
    const adjusted = applyLevels(new Float32Array([-0.2, 0.5, 1.2]), {
      blackPoint: 0.2,
      whitePoint: 0.8,
      gamma: 2,
    });

    expect(Array.from(adjusted)).toEqual([0, expect.closeTo(Math.sqrt(0.5), 5), 1]);
  });

  it('returns a copy when the buffer does not match the declared shape', () => {
    const source = new Float32Array([0, 0.5, 1]);
    const blurred = boxBlur(source, { width: 4, height: 3, radius: 2 });
    expect(Array.from(blurred)).toEqual(Array.from(source));
    expect(blurred).not.toBe(source);
  });

  it('preserves the mean while blurring with a separable box filter', () => {
    const source = new Float32Array([0, 0.1, 0.85, 0.2, 0.4, 1, 0.6, 0.3, 0.75, 0.05, 0.2, 0.9]);
    const blurred = boxBlur(source, { width: 4, height: 3, radius: 2 });

    expect(average(blurred)).toBeCloseTo(average(source), 6);
    expect(blurred).not.toBe(source);
  });

  it('increases local variance when clarity is applied', () => {
    const source = new Float32Array([0, 0.5, 0.5, 0.5, 1]);
    const sharpened = applyClarity(source, { width: 5, height: 1, radius: 1, amount: 1 });

    expect(variance(sharpened)).toBeGreaterThan(variance(source));
  });
});