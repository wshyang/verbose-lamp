// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RgbaImage } from '@/shared/lib/raster';
import { buildCurveLut, buildFoldLut, foldTone } from './curve';
import { downloadGildedPng } from './export';
import { buildGoldRampLut } from './goldRamp';
import { loadRgbaImage } from './load';
import { buildShapeMask, chokeMask } from './mask';
import { buildGildingToneLut, gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';
import { boxBlur, toLuminance } from './tone';

const IMAGE: RgbaImage = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4).fill(160) };
const PARAMS = GILDING_PRESETS[0].params;

describe('curve edges', () => {
  it('falls back to the identity curve when no usable point is given', () => {
    const lut = buildCurveLut([]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBeGreaterThan(120);
    expect(lut[255]).toBe(255);
  });

  it('clamps, sorts and de-duplicates the control points', () => {
    const lut = buildCurveLut([
      { x: 0.8, y: 1.4 },
      { x: 0.2, y: -1 },
      { x: 0.2, y: 0.9 },
      { x: Number.NaN, y: 0.5 },
    ]);
    expect(lut).toHaveLength(256);
    expect(lut[255]).toBe(255);
    expect(lut[0]).toBe(0);
  });

  it('adds the endpoints when the points stop short of them', () => {
    const lut = buildCurveLut([{ x: 0.5, y: 0.9 }]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(lut[128]).toBeGreaterThan(150);
  });

  it('folds the tone the requested number of times, and ignores nonsense folds', () => {
    expect(foldTone(0.3, 0)).toBe(0.3);
    expect(foldTone(0.3, 1)).toBeCloseTo(0.4, 6);
    expect(foldTone(0.3, -2)).toBe(0.3);
    expect(foldTone(0.3, Number.NaN)).toBe(0.3);
    expect(foldTone(2, 0)).toBe(1);
    expect(buildFoldLut(Number.POSITIVE_INFINITY)).toHaveLength(256);
  });
});

describe('gold ramp edges', () => {
  it('falls back to a two-stop ramp for an empty list', () => {
    const lut = buildGoldRampLut([]);
    expect(lut).toHaveLength(256 * 3);
    expect(lut[0]).toBeLessThan(lut[lut.length - 3]);
  });

  it('sorts, clamps and de-duplicates stops, and defaults a bad hex', () => {
    const lut = buildGoldRampLut([
      { position: 1.4, color: '#ffffff' },
      { position: -0.2, color: 'not-a-colour' },
      { position: -0.2, color: '#000000' },
      { position: 0.5, color: '#808080' },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[lut.length - 3]).toBe(255);
  });

  it('defaults a stop whose colour is not a hex triplet', () => {
    const lut = buildGoldRampLut([
      { position: 0, color: 'gold' },
      { position: 1, color: '#fff6dc' },
    ]);
    // The bad colour parses as the deep-brown default, not as black or transparent.
    expect(lut[0]).toBe(42);
    expect(lut[1]).toBe(26);
    expect(lut[2]).toBe(6);
  });

  it('clamps an endpoint slope that would overshoot a flat neighbour', () => {
    // A steep first segment next to a flat one: the Hermite tangent is capped at 3×.
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.2, y: 1 },
      { x: 0.4, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    for (let index = 1; index < lut.length; index += 1) expect(lut[index]).toBeGreaterThanOrEqual(lut[index - 1] - 1);
  });

  it('expands a single stop across the whole ramp', () => {
    const lut = buildGoldRampLut([{ position: 0.5, color: '#123456' }]);
    expect(lut[0]).toBe(0x12);
    expect(lut[lut.length - 3]).toBe(0x12);
  });
});

describe('mask edges', () => {
  it('returns a copy for a zero or non-finite choke', () => {
    const mask = buildShapeMask({ shape: 'oval', width: 8, height: 8, feather: 0.1 });
    expect(chokeMask(mask, 0).data).toEqual(mask.data);
    expect(chokeMask(mask, Number.NaN).data).toEqual(mask.data);
  });

  it('collapses to nothing when the choke covers the mask', () => {
    const mask = buildShapeMask({ shape: 'oval', width: 8, height: 8, feather: 0.1 });
    expect(chokeMask(mask, 40).data.every((value) => value === 0)).toBe(true);
  });
});

describe('tone edges', () => {
  it('returns a copy when the buffer does not match its dimensions', () => {
    const values = new Float32Array(3);
    expect(boxBlur(values, { width: 4, height: 4, radius: 2 })).toEqual(values);
    expect(boxBlur(values, { width: 4, height: 4, radius: 2 })).not.toBe(values);
  });

  it('returns a copy for a zero radius', () => {
    const values = toLuminance(IMAGE);
    expect(boxBlur(values, { width: 4, height: 4, radius: 0 })).toEqual(values);
  });
});

describe('pipeline guards', () => {
  it('rejects unusable image shapes before doing any work', () => {
    expect(() => gildImage({ ...IMAGE, width: 0 }, PARAMS)).toThrow(RangeError);
    expect(() => gildImage({ ...IMAGE, data: new Uint8ClampedArray(4) }, PARAMS)).toThrow(RangeError);
  });

  it('builds a monotone 256-entry tone lookup', () => {
    const lut = buildGildingToneLut(PARAMS);
    expect(lut).toHaveLength(256);
    expect(lut[0]).toBeLessThanOrEqual(lut[255]);
  });

  it('gilds a small image in place-free fashion', () => {
    const gilded = gildImage(IMAGE, { ...PARAMS, folds: 3, levels: 42 });
    expect(gilded).not.toBe(IMAGE);
    expect(gilded.data).not.toBe(IMAGE.data);
    expect(gilded.width).toBe(IMAGE.width);
  });
});

describe('load and export failures', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 4, close: () => undefined })));
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports an unusable image when the canvas has no 2D context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(loadRgbaImage(new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow(
      'could not be opened'
    );
  });

  it('throws when the browser cannot encode a PNG', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
    await expect(downloadGildedPng(IMAGE)).rejects.toThrow('PNG export is unavailable');
  });
});

describe('curve endpoint slopes', () => {
  it('caps a steep first segment that runs into a cliff', () => {
    // Secants of +1 then −50: the clamped tangent is 3× the first secant, so the
    // ramp leaves zero smoothly instead of looping back below it.
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0.51, y: 0 },
      { x: 1, y: 0.2 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[lut.length - 1]).toBe(51);
    for (let index = 1; index < 40; index += 1) expect(lut[index]).toBeGreaterThanOrEqual(0);
  });
});

describe('mask with non-finite geometry', () => {
  it('falls back to an empty mask instead of allocating NaN pixels', () => {
    const mask = buildShapeMask({ shape: 'oval', width: Number.NaN, height: 8, feather: 0.1 });
    expect(mask.width).toBe(0);
    expect(mask.data).toHaveLength(0);

    const other = buildShapeMask({ shape: 'oval', width: 8, height: Number.POSITIVE_INFINITY, feather: 0.1 });
    expect(other.height).toBe(0);
  });

  it('treats a non-finite feather as a hard edge', () => {
    const mask = buildShapeMask({ shape: 'oval', width: 8, height: 8, feather: Number.NaN });
    const hard = buildShapeMask({ shape: 'oval', width: 8, height: 8, feather: 0 });
    expect(mask.data).toEqual(hard.data);
  });
});
