import { describe, expect, it } from 'vitest';
import { blackbodyColor, GREEN_LIGHT, rgbCss } from './blackbody';

describe('blackbodyColor', () => {
  it('starts white-hot and cools to ember across the ramp', () => {
    expect(blackbodyColor(0)).toEqual({ r: 1, g: 1, b: 0.97 });
    expect(blackbodyColor(1)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
    expect(blackbodyColor(0.42)).toEqual({ r: 1, g: 0.78, b: 0.36 });
  });

  it('interpolates between stops', () => {
    const mid = blackbodyColor(0.09); // halfway white-hot -> champagne
    expect(mid.r).toBeCloseTo(1, 6);
    expect(mid.g).toBeCloseTo(0.965, 6);
    expect(mid.b).toBeCloseTo(0.845, 6);
  });

  it('clamps outside the ramp', () => {
    expect(blackbodyColor(-3)).toEqual(blackbodyColor(0));
    expect(blackbodyColor(7)).toEqual(blackbodyColor(1));
  });
});

describe('rgbCss', () => {
  it('formats the green light as rgba()', () => {
    expect(rgbCss(GREEN_LIGHT, 0.5)).toBe('rgba(89,255,140,0.5)');
  });
});
