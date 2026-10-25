import { describe, expect, it } from 'vitest';
import { dilateAlpha, erodeAlpha } from './morphology';
import { cropSquare, resampleAlpha, solidAlpha } from './resample';
import type { AlphaMask, RgbaImage } from './types';

function mask(width = 4, height = 4, value = 0): AlphaMask {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(value) };
}

function image(width = 4, height = 4): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(180) };
}

describe('dilate/erode guards', () => {
  it('returns a fresh copy for a zero radius', () => {
    const source = mask();
    const grown = dilateAlpha(source, 0);
    expect(grown.data).toEqual(source.data);
    expect(grown.data).not.toBe(source.data);
  });

  it('treats a negative, fractional or non-finite radius as "no change"', () => {
    for (const radius of [-2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const shrunk = erodeAlpha(mask(), radius);
      expect(shrunk.data.every((value) => value === 0)).toBe(true);
    }
  });

  it('grows a single lit pixel into its neighbourhood and erodes it back', () => {
    const source = mask(5, 5);
    source.data[12] = 255;
    const grown = dilateAlpha(source, 1);
    expect(grown.data[7]).toBe(255);
    expect(grown.data[11]).toBe(255);
    const eroded = erodeAlpha(grown, 1);
    expect(eroded.data[12]).toBe(255);
    expect(eroded.data[7]).toBe(0);
  });
});

describe('resample guards', () => {
  const box = { x: 0, y: 0, size: 2 };

  it('rejects a non-positive output size', () => {
    for (const size of [0, -1, 1.5, Number.NaN]) {
      expect(() => cropSquare(image(), box, size)).toThrow(RangeError);
      expect(() => resampleAlpha(mask(), box, size)).toThrow(RangeError);
    }
  });

  it('rejects a non-positive crop box', () => {
    expect(() => cropSquare(image(), { x: 0, y: 0, size: 0 }, 2)).toThrow(RangeError);
    expect(() => resampleAlpha(mask(), { x: 0, y: 0, size: Number.NaN }, 2)).toThrow(RangeError);
  });

  it('rejects a buffer that does not match its dimensions', () => {
    const broken = { ...image(), data: new Uint8ClampedArray(4) };
    expect(() => cropSquare(broken, box, 2)).toThrow(RangeError);
    const brokenMask = { ...mask(), data: new Uint8ClampedArray(4) };
    expect(() => resampleAlpha(brokenMask, box, 2)).toThrow(RangeError);
  });

  it('builds a solid mask at the requested size and value', () => {
    expect(solidAlpha(3).data).toEqual(new Uint8ClampedArray(9).fill(255));
    expect(solidAlpha(2, 7).data).toEqual(new Uint8ClampedArray(4).fill(7));
  });
});
