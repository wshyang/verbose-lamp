import type { AlphaMask } from './types';

/**
 * Grey-scale dilation and erosion with a square window, separable into a row pass and a
 * column pass. Windows are clipped to the raster, so the border is never eaten by
 * imaginary outside pixels: an all-opaque mask stays all-opaque after erosion.
 */

type Pick = (first: number, second: number) => number;

interface PassGeometry {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

function passRows(source: Uint8ClampedArray, geometry: PassGeometry, pick: Pick): Uint8ClampedArray {
  const { width, height, radius } = geometry;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let value = source[row + x];
      const last = Math.min(width - 1, x + radius);
      for (let at = Math.max(0, x - radius); at <= last; at += 1) value = pick(value, source[row + at]);
      output[row + x] = value;
    }
  }
  return output;
}

function passColumns(source: Uint8ClampedArray, geometry: PassGeometry, pick: Pick): Uint8ClampedArray {
  const { width, height, radius } = geometry;
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    const last = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      let value = source[y * width + x];
      for (let at = Math.max(0, y - radius); at <= last; at += 1) value = pick(value, source[at * width + x]);
      output[y * width + x] = value;
    }
  }
  return output;
}

function morph(mask: AlphaMask, radius: number, pick: Pick): AlphaMask {
  const amount = Number.isFinite(radius) ? Math.max(0, Math.round(radius)) : 0;
  if (amount === 0) return { ...mask, data: new Uint8ClampedArray(mask.data) };
  const geometry = { width: mask.width, height: mask.height, radius: amount };
  return { ...mask, data: passColumns(passRows(mask.data, geometry, pick), geometry, pick) };
}

/** Grow coverage outward by `radius` pixels. */
export function dilateAlpha(mask: AlphaMask, radius: number): AlphaMask {
  return morph(mask, radius, Math.max);
}

/** Shrink coverage inward by `radius` pixels. */
export function erodeAlpha(mask: AlphaMask, radius: number): AlphaMask {
  return morph(mask, radius, Math.min);
}
