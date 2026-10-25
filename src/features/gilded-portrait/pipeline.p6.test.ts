// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';

describe('gilding pipeline', () => {
  it('rejects images whose dimensions or buffer do not describe a real bitmap', () => {
    expect(() =>
      gildImage({ width: 0, height: 8, data: new Uint8ClampedArray(0) }, GILDING_PRESETS[0].params)
    ).toThrow('Image dimensions must be positive integers.');
    expect(() =>
      gildImage({ width: 2, height: 2, data: new Uint8ClampedArray(4) }, GILDING_PRESETS[0].params)
    ).toThrow('Image buffer size does not match its dimensions.');
  });
});
