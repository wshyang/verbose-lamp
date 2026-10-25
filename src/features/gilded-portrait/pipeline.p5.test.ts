// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';

describe('gilding image validation', () => {
  const params = GILDING_PRESETS[0].params;

  it('rejects non-positive and non-integer dimensions', () => {
    expect(() => gildImage({ width: 0, height: 1, data: new Uint8ClampedArray(0) }, params))
      .toThrow(/positive integers/);
    expect(() => gildImage({ width: 2.5, height: 2, data: new Uint8ClampedArray(20) }, params))
      .toThrow(/positive integers/);
  });

  it('rejects a buffer that does not match the dimensions', () => {
    expect(() => gildImage({ width: 2, height: 1, data: new Uint8ClampedArray(4) }, params))
      .toThrow(/buffer size/);
  });
});
