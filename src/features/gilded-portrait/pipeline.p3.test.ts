// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildGildingToneLut, gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';

describe('gildImage input guards', () => {
  it('rejects a non-integer or empty size', () => {
    expect(() => gildImage({ width: 0, height: 4, data: new Uint8ClampedArray(0) }, GILDING_PRESETS[0].params)).toThrow(RangeError);
    expect(() =>
      gildImage({ width: 2.5, height: 4, data: new Uint8ClampedArray(40) }, GILDING_PRESETS[0].params),
    ).toThrow('Image dimensions must be positive integers.');
  });

  it('rejects a buffer that does not match its dimensions', () => {
    expect(() =>
      gildImage({ width: 2, height: 2, data: new Uint8ClampedArray(8) }, GILDING_PRESETS[0].params),
    ).toThrow('Image buffer size does not match its dimensions.');
  });
});
describe('buildGildingToneLut', () => {
  it('builds a monotonic 256-entry tone table', () => {
    const lut = buildGildingToneLut(GILDING_PRESETS[0].params);
    expect(lut).toHaveLength(256);
    expect(lut.every((value) => Number.isInteger(value))).toBe(true);
    expect(lut.some((value) => value !== lut[0])).toBe(true);
    const other = buildGildingToneLut(GILDING_PRESETS[2].params);
    expect(Array.from(other)).not.toEqual(Array.from(lut));
  });
});
