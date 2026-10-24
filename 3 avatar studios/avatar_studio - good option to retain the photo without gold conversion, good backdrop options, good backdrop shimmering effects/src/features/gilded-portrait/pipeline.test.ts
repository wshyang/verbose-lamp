import { describe, expect, it } from 'vitest';
import { buildStudioPortraitFixture } from './fixtures';
import { buildGildingToneLut, gildImage } from './pipeline';
import { GILDING_PRESETS } from './presets';
import type { GildingParams, RgbaImage } from './types';

describe('gilding pipeline', () => {
  it('does not mutate its source image', () => {
    const source = buildStudioPortraitFixture(8);
    const original = Array.from(source.data);

    const output = gildImage(source, GILDING_PRESETS[0].params);

    expect(Array.from(source.data)).toEqual(original);
    expect(output.data).not.toBe(source.data);
  });

  it('preserves dimensions and applies mask alpha to the output', () => {
    const source: RgbaImage = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4).fill(255),
    };
    const params: GildingParams = {
      ...GILDING_PRESETS[0].params,
      mask: { shape: 'oval', feather: 0, choke: 0 },
    };
    const output = gildImage(source, params);

    expect(output.width).toBe(source.width);
    expect(output.height).toBe(source.height);
    expect(output.data).toHaveLength(source.data.length);
    expect(output.data[3]).toBe(0);
    expect(output.data[(4 * source.width + 4) * 4 + 3]).toBe(255);
  });

  it('snapshots signature preset tone LUTs and the 8 by 8 fixture pixels', () => {
    const presetLuts = Object.fromEntries(
      GILDING_PRESETS.map((preset) => [preset.id, Array.from(buildGildingToneLut(preset.params)).join(',')])
    );
    const fixtureOutput = Array.from(
      gildImage(buildStudioPortraitFixture(8), GILDING_PRESETS[0].params).data
    ).join(',');

    expect(presetLuts).toMatchSnapshot('signature gilding tone LUTs');
    expect(fixtureOutput).toMatchSnapshot('8 by 8 Gatsby Bullion fixture output');
  });
});