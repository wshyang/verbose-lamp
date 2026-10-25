// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { cropSquare, resampleAlpha } from './resample';
import { dilateAlpha, erodeAlpha } from './morphology';
import { type AlphaMask, type RgbaImage } from './types';

/** A deterministic "dusk over the Riviera" gradient: every pixel and channel distinct enough to catch a shift. */
function rivieraGradient_p3(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data.set([(x * 31 + y * 7) % 256, (y * 29 + 40) % 256, (x * 11 + y * 13 + 90) % 256, 255], pixel * 4);
  }
  return { width, height, data };
}
describe('raster input guards', () => {
  const image = rivieraGradient_p3(8, 8);
  const box = { x: 0, y: 0, size: 8 };
  const mask: AlphaMask = { width: 8, height: 8, data: new Uint8ClampedArray(64).fill(255) };

  it('rejects a crop box with no size', () => {
    expect(() => cropSquare(image, { ...box, size: 0 }, 4)).toThrow(RangeError);
    expect(() => cropSquare(image, { ...box, size: Number.NaN }, 4)).toThrow(RangeError);
  });

  it('rejects an output size that is not a positive integer', () => {
    expect(() => cropSquare(image, box, 0)).toThrow(RangeError);
    expect(() => resampleAlpha(mask, box, 2.5)).toThrow(RangeError);
  });

  it('rejects a buffer that does not match its dimensions', () => {
    const broken = { ...image, data: new Uint8ClampedArray(9) };
    expect(() => cropSquare(broken, box, 4)).toThrow(RangeError);
    const empty = { ...image, width: 0 };
    expect(() => cropSquare(empty, box, 4)).toThrow(RangeError);
  });

  it('copies the mask when the blur radius is not a finite number', () => {
    const dilated = dilateAlpha(mask, Number.NaN);
    expect(dilated.data).not.toBe(mask.data);
    expect(Array.from(dilated.data)).toEqual(Array.from(mask.data));
    expect(Array.from(dilateAlpha(mask, 0).data)).toEqual(Array.from(mask.data));
  });

  it('grows and shrinks coverage by a radius', () => {
    const single: AlphaMask = { width: 5, height: 5, data: new Uint8ClampedArray(25) };
    single.data[12] = 255;
    const grown = dilateAlpha(single, 1);
    expect(Array.from(grown.data).filter((value) => value === 255)).toHaveLength(9);
    const shrunk = erodeAlpha(grown, 1);
    expect(Array.from(shrunk.data).filter((value) => value === 255).length).toBeLessThanOrEqual(9);
  });
});
