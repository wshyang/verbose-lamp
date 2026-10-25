// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildCurveLut, foldTone } from './curve';

describe('curve normalisation', () => {
  it('drops non-finite points, clamps the rest and closes the ends', () => {
    const lut = buildCurveLut([
      { x: Number.NaN, y: 0.5 },
      { x: 0.4, y: 1.4 },
      { x: 0.4, y: 0.6 },
      { x: 2, y: -1 },
    ]);
    expect(lut).toHaveLength(256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(0);
  });

  it('pads a curve that does not start at zero or end at one', () => {
    const lut = buildCurveLut([
      { x: 0.3, y: 0.2 },
      { x: 0.6, y: 0.9 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it('falls back to the identity curve for unusable input', () => {
    const lut = buildCurveLut([{ x: Number.POSITIVE_INFINITY, y: 0 }]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBeGreaterThan(120);
    expect(lut[255]).toBe(255);
  });

  it('treats a non-finite fold count as no folds', () => {
    expect(foldTone(0.3, Number.NaN)).toBeCloseTo(0.3, 6);
    expect(foldTone(0.3, -2)).toBeCloseTo(0.3, 6);
  });
});
describe('endpoint slopes that would cusp', () => {
  it('clamps a wild endpoint slope to three times the first secant', () => {
    // First interval is wide, second narrow and steep the other way: the solver wants a
    // slope far beyond 3× the first secant, so the endpoint is clamped instead.
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.4, y: 1 },
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(lut).toHaveLength(256);
    for (const value of lut) expect(Number.isFinite(value)).toBe(true);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });
});
