import { describe, expect, it } from 'vitest';
import { buildCurveLut, foldTone } from './curve';
import { buildGoldRampLut } from '@/shared/lib/goldRamp';
import { buildShapeMask, chokeMask } from './mask';
import { gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';
import { boxBlur } from './tone';
import { validateImageFile } from './validate';

describe('curve and ramp normalization', () => {
  it('handles duplicate, empty/non-finite, interior-only, and endpoint-slope guards', () => {
    const duplicate = buildCurveLut([{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }]);
    expect(duplicate[128]).toBeGreaterThan(200);
    expect(Array.from(buildCurveLut([]))).toEqual(Array.from({ length: 256 }, (_, i) => i));
    expect(buildCurveLut([{ x: Number.NaN, y: 0 }, { x: 0.4, y: Number.POSITIVE_INFINITY }])[255]).toBe(255);
    expect(buildCurveLut([{ x: 0.5, y: 0.25 }])[128]).toBeLessThan(128);
    expect(buildCurveLut([{ x: 0, y: 0 }, { x: 0.5, y: 0.1 }, { x: 1, y: 1 }]).length).toBe(256);
    expect(buildCurveLut([{ x: 0, y: 0 }, { x: 0.9, y: 0.9 }, { x: 1, y: 0 }])[230]).toBeGreaterThan(200);
    expect(foldTone(0.25, Number.NaN)).toBe(0.25);
  });

  it('handles invalid colours and duplicate/interior/empty stops', () => {
    const duplicate = buildGoldRampLut([
      { position: 0.5, color: 'not-a-colour' },
      { position: 0.5, color: '#ffffff' },
    ]);
    expect(Array.from(duplicate.slice(128 * 3, 128 * 3 + 3))).toEqual([255, 255, 255]);
    expect(buildGoldRampLut([])[0]).toBe(42);
    const interior = buildGoldRampLut([{ position: 0.5, color: '#102030' }]);
    expect(Array.from(interior.slice(0, 3))).toEqual([16, 32, 48]);
    expect(Array.from(interior.slice(-3))).toEqual([16, 32, 48]);
    // A surviving stop with an unparseable colour falls back to the dark gold.
    const invalid = buildGoldRampLut([{ position: 0.25, color: 'ochre-ish' }]);
    expect(Array.from(invalid.slice(0, 3))).toEqual([42, 26, 6]);
    expect(Array.from(invalid.slice(-3))).toEqual([42, 26, 6]);
  });
});

describe('mask and tone invalid shapes', () => {
  it('normalizes non-finite dimensions/feather and clears an over-choked mask', () => {
    expect(buildShapeMask({ width: Number.NaN, height: 4, shape: 'oval', feather: 0.1 }))
      .toMatchObject({ width: 0, height: 4 });
    expect(buildShapeMask({ width: 4, height: Number.POSITIVE_INFINITY, shape: 'oval', feather: 0.1 }))
      .toMatchObject({ width: 4, height: 0 });
    const hard = buildShapeMask({ width: 9, height: 9, shape: 'oval', feather: Number.NaN });
    expect(new Set(hard.data).size).toBeLessThanOrEqual(2);
    const mask = { width: 4, height: 4, data: new Uint8ClampedArray(16).fill(255) };
    expect(chokeMask(mask, 2).data.every((value) => value === 0)).toBe(true);
    expect(chokeMask(mask, Number.NaN).data).toEqual(mask.data);
    const values = Float32Array.from([1, 2]);
    expect(boxBlur(values, { width: 3, height: 3, radius: 1 })).toEqual(values);
  });
});

describe('pipeline and validation guards', () => {
  it('throws for invalid image dimensions and buffers', () => {
    const params = GILDING_PRESETS[0].params;
    expect(() => gildImage({ width: 0, height: 1, data: new Uint8ClampedArray(0) }, params)).toThrow(RangeError);
    expect(() => gildImage({ width: 2, height: 1, data: new Uint8ClampedArray(4) }, params)).toThrow(RangeError);
  });

  it('treats a non-string file type as empty', () => {
    expect(validateImageFile({ type: 42, size: 10 } as never).ok).toBe(false);
  });
});
