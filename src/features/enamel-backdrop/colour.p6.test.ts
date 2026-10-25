// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { mixRgb, parseHexColour, scaleRgb, lumaOf, rampColour } from './colour';

describe('parseHexColour', () => {
  it('reads six hex digits with or without the hash, in any case', () => {
    expect(parseHexColour('#1A2B3C')).toEqual([26, 43, 60]);
    expect(parseHexColour('ffffff')).toEqual([255, 255, 255]);
  });

  it('returns black for anything it cannot read, rather than NaN colours', () => {
    expect(parseHexColour('nope')).toEqual([0, 0, 0]);
    expect(parseHexColour('#fff')).toEqual([0, 0, 0]);
    expect(parseHexColour('')).toEqual([0, 0, 0]);
  });
});
describe('mixRgb, scaleRgb, lumaOf, rampColour', () => {
  it('mixes by a clamped share', () => {
    expect(mixRgb([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
    expect(mixRgb([10, 10, 10], [0, 0, 0], -2)).toEqual([10, 10, 10]);
    expect(mixRgb([10, 10, 10], [0, 0, 0], 3)).toEqual([0, 0, 0]);
  });

  it('scales and measures luminance', () => {
    expect(scaleRgb([10, 20, 30], 2)).toEqual([20, 40, 60]);
    expect(lumaOf([255, 255, 255])).toBeCloseTo(1, 12);
    expect(lumaOf([0, 0, 0])).toBe(0);
  });

  it('reads a gold ramp lookup table at a clamped position', () => {
    const lut = new Uint8Array(256 * 3);
    lut[255 * 3] = 9;
    lut[255 * 3 + 1] = 8;
    lut[255 * 3 + 2] = 7;

    expect(rampColour(lut, 2)).toEqual([9, 8, 7]);
    expect(rampColour(lut, 0)).toEqual([0, 0, 0]);
  });
});
