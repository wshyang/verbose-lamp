// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildCurveLut, foldTone } from './curve';

describe('buildCurveLut normalisation and endpoint slopes', () => {
  it('falls back to the identity curve when no finite points survive', () => {
    const identity = buildCurveLut([]);
    expect(identity[0]).toBe(0);
    expect(identity[128]).toBe(128);
    expect(identity[255]).toBe(255);
    expect(buildCurveLut([{ x: Number.NaN, y: 0.5 }])).toEqual(identity);
  });

  it('lets the last point win at a repeated x and pads both ends', () => {
    expect(buildCurveLut([{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }]))
      .toEqual(buildCurveLut([{ x: 0.5, y: 0.8 }]));
  });

  it('zeroes an endpoint slope that would run against monotone data', () => {
    const lut = buildCurveLut([{ x: 0, y: 0 }, { x: 0.9, y: 0.1 }, { x: 1, y: 1 }]);
    for (let i = 1; i < lut.length; i += 1) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
  });

  it('clamps a reversing endpoint slope to three times the first secant', () => {
    const lut = buildCurveLut([{ x: 0, y: 0.5 }, { x: 0.8, y: 0.58 }, { x: 0.85, y: 0.1 }, { x: 1, y: 1 }]);
    for (let i = 1; i <= 204; i += 1) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    expect(lut[204]).toBeLessThanOrEqual(Math.round(0.58 * 255));
  });

  it('ignores non-finite or negative fold counts', () => {
    expect(foldTone(0.25, Number.NaN)).toBe(0.25);
    expect(foldTone(0.25, Number.POSITIVE_INFINITY)).toBe(0.25);
    expect(foldTone(0.25, -2)).toBe(0.25);
  });
});
