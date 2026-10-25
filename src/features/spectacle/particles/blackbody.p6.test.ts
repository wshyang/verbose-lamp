// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';

import { blackbodyColor, GREEN_LIGHT, rgbCss } from './blackbody';

describe('blackbodyColor', () => {
  it('clamps to the ends of the ramp', () => {
    expect(blackbodyColor(-1)).toEqual({ r: 1, g: 1, b: 0.97 });
    expect(blackbodyColor(2)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
    expect(blackbodyColor(1)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
  });

  it('interpolates between stops, monotone in the green channel', () => {
    let previous = 1;
    for (let t = 0; t <= 1; t += 0.05) {
      const colour = blackbodyColor(t);
      expect(colour.g).toBeLessThanOrEqual(previous + 1e-12);
      previous = colour.g;
    }
  });

  it('returns the last stop for any value past the top of the ramp', () => {
    // The loop only interpolates between stops, so the top needs its own stop.
    expect(blackbodyColor(1.5)).toEqual(blackbodyColor(1));
  });
});
describe('rgbCss', () => {
  it('writes an rgba() string with rounded channels and the given alpha', () => {
    expect(rgbCss(GREEN_LIGHT, 0.5)).toBe('rgba(89,255,140,0.5)');
    expect(rgbCss({ r: 0, g: 0, b: 0 }, 1)).toBe('rgba(0,0,0,1)');
  });
});
