import { describe, expect, it } from 'vitest';
import { dilateAlpha } from './morphology';
import { resampleAlpha } from './resample';

describe('raster guards', () => {
  const mask = { width: 2, height: 2, data: new Uint8ClampedArray([0, 10, 20, 30]) };

  it('copies a mask unchanged for a non-finite morphology radius', () => {
    const result = dilateAlpha(mask, Number.NaN);
    expect(result.data).toEqual(mask.data);
    expect(result.data).not.toBe(mask.data);
  });

  it('throws for invalid crop sizes and raster buffers', () => {
    expect(() => resampleAlpha(mask, { x: 0, y: 0, size: 0 }, 2)).toThrow(RangeError);
    expect(() => resampleAlpha(
      { width: 2, height: 2, data: new Uint8ClampedArray(3) }, { x: 0, y: 0, size: 1 }, 2
    )).toThrow(RangeError);
  });
});
