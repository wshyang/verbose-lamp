import { describe, expect, it } from 'vitest';
import { cropSquare, resampleAlpha, solidAlpha } from './resample';
import { dilateAlpha, erodeAlpha } from './morphology';
import type { AlphaMask, RgbaImage } from './types';

/** A deterministic "dusk over the Riviera" gradient: every pixel and channel distinct enough to catch a shift. */
function rivieraGradient(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data.set([(x * 31 + y * 7) % 256, (y * 29 + 40) % 256, (x * 11 + y * 13 + 90) % 256, 255], pixel * 4);
  }
  return { width, height, data };
}

function dotMask(size: number, at: { x: number; y: number }): AlphaMask {
  const data = new Uint8ClampedArray(size * size);
  data[at.y * size + at.x] = 255;
  return { width: size, height: size, data };
}

describe('cropSquare / resampleAlpha', () => {
  it('returns the identical image at 1:1', () => {
    const image = rivieraGradient(8, 8);
    const cropped = cropSquare(image, { x: 0, y: 0, size: 8 }, 8);
    expect(Array.from(cropped.data)).toEqual(Array.from(image.data));
  });

  it('produces the requested output size', () => {
    const cropped = cropSquare(rivieraGradient(12, 9), { x: 2, y: 1, size: 7 }, 5);
    expect(cropped.width).toBe(5);
    expect(cropped.height).toBe(5);
    expect(cropped.data.length).toBe(5 * 5 * 4);
  });

  it('clamps samples that fall outside the source to the edge', () => {
    const image = rivieraGradient(6, 6);
    const cropped = cropSquare(image, { x: -6, y: 0, size: 6 }, 6);
    for (let y = 0; y < 3; y += 1) {
      expect(cropped.data[(y * 6) * 4]).toBe(image.data[(y * 6) * 4]);
    }
  });

  it('never mutates its input', () => {
    const image = rivieraGradient(10, 7);
    const before = Array.from(image.data);
    cropSquare(image, { x: 1.5, y: 0.25, size: 6.5 }, 4);
    expect(Array.from(image.data)).toEqual(before);
  });

  it('keeps a mask aligned with the photo crop', () => {
    const image = rivieraGradient(10, 10);
    const red: AlphaMask = { width: 10, height: 10, data: Uint8ClampedArray.from({ length: 100 }, (_, i) => image.data[i * 4]) };
    const box = { x: 1.25, y: 2.5, size: 6 };
    const croppedImage = cropSquare(image, box, 4);
    const croppedMask = resampleAlpha(red, box, 4);
    expect(Array.from(croppedMask.data)).toEqual(Array.from({ length: 16 }, (_, i) => croppedImage.data[i * 4]));
  });

  it('rejects impossible output sizes', () => {
    expect(() => cropSquare(rivieraGradient(4, 4), { x: 0, y: 0, size: 4 }, 0)).toThrow(RangeError);
  });
});

describe('dilateAlpha / erodeAlpha', () => {
  it('grows a single pixel into a (2r+1)² square', () => {
    const grown = dilateAlpha(dotMask(9, { x: 4, y: 4 }), 2);
    expect(grown.data.filter((value) => value === 255).length).toBe(25);
  });

  it('shrinks coverage but never eats the border of a solid mask', () => {
    expect(erodeAlpha(dotMask(9, { x: 4, y: 4 }), 1).data.every((value) => value === 0)).toBe(true);
    expect(erodeAlpha(solidAlpha(9), 3).data.every((value) => value === 255)).toBe(true);
  });

  it('leaves its input untouched', () => {
    const mask = dotMask(7, { x: 3, y: 3 });
    dilateAlpha(mask, 2);
    expect(mask.data.filter((value) => value === 255).length).toBe(1);
  });
});
