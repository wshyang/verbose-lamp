// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { cropSquare } from './resample';
import { dilateAlpha, erodeAlpha } from './morphology';
import { type AlphaMask, type RgbaImage } from './types';

describe('cropSquare validation', () => {
  const image: RgbaImage = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) };

  it('rejects crop boxes with non-positive or non-finite size', () => {
    expect(() => cropSquare(image, { x: 0, y: 0, size: 0 }, 2)).toThrow(/Crop box size/);
    expect(() => cropSquare(image, { x: 0, y: 0, size: Number.NaN }, 2)).toThrow(/Crop box size/);
  });

  it('rejects a raster whose buffer does not match its dimensions', () => {
    const broken: RgbaImage = { width: 2, height: 2, data: new Uint8ClampedArray(4) };
    expect(() => cropSquare(broken, { x: 0, y: 0, size: 2 }, 2)).toThrow(/buffer size/);
  });
});
describe('morphology no-op radii', () => {
  const mask: AlphaMask = { width: 3, height: 3, data: new Uint8ClampedArray(9).fill(128) };

  it('returns a copy for zero, negative or non-finite radii', () => {
    const still = dilateAlpha(mask, Number.NaN);
    expect(still.data).toEqual(mask.data);
    expect(still.data).not.toBe(mask.data);
    expect(erodeAlpha(mask, 0).data).toEqual(mask.data);
    expect(erodeAlpha(mask, -3).data).toEqual(mask.data);
  });
});
