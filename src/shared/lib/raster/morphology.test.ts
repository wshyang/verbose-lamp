import { describe, expect, it } from 'vitest';
import { dilateAlpha, erodeAlpha } from './morphology';

/**
 * Morphology is the last thing between a cut-out and a clean edge. Its zero-radius
 * path must be a copy — an erode/dilate of "nothing" that mutates the caller's buffer
 * would corrupt the portrait pipeline in place.
 */
const mask = (width: number, height: number, data: number[]) => ({
  width,
  height,
  data: new Uint8ClampedArray(data),
});

describe('dilateAlpha and erodeAlpha', () => {
  it('copies the mask untouched at radius zero', () => {
    const source = mask(2, 1, [0, 255]);

    const dilated = dilateAlpha(source, 0);
    const eroded = erodeAlpha(source, 0);

    expect(Array.from(dilated.data)).toEqual([0, 255]);
    expect(Array.from(eroded.data)).toEqual([0, 255]);
    expect(dilated.data).not.toBe(source.data);
    expect(eroded.data).not.toBe(source.data);
  });

  it('treats a non-finite radius as zero', () => {
    const source = mask(2, 1, [0, 255]);

    expect(Array.from(dilateAlpha(source, Number.NaN).data)).toEqual([0, 255]);
  });

  it('spreads the bright pixel by the radius when dilating, and the dark one when eroding', () => {
    const source = mask(5, 1, [0, 0, 255, 0, 0]);

    expect(Array.from(dilateAlpha(source, 1).data)).toEqual([0, 255, 255, 255, 0]);
    expect(Array.from(erodeAlpha(source, 1).data)).toEqual([0, 0, 0, 0, 0]);
  });

  it('never eats the border of an all-opaque mask when eroding', () => {
    const source = mask(3, 3, Array.from({ length: 9 }, () => 255));

    expect(Array.from(erodeAlpha(source, 1).data)).toEqual(Array.from({ length: 9 }, () => 255));
  });
});
