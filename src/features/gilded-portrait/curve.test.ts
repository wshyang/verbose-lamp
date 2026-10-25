import { describe, expect, it } from 'vitest';
import { buildFoldLut, buildCurveLut, foldTone } from './curve';
import { GILDING_PRESETS } from './presets';

function countPeaks(lut: Uint8Array): number {
  let peaks = 0;
  for (let index = 1; index < lut.length - 1; index += 1) {
    if (lut[index] > lut[index - 1] && lut[index] >= lut[index + 1]) peaks += 1;
  }
  return peaks;
}

describe('tone curves and fold LUTs', () => {
  it('keeps both curve endpoints', () => {
    const lut = buildCurveLut([{ x: 0, y: 0.12 }, { x: 1, y: 0.88 }]);

    expect(lut[0]).toBe(Math.round(0.12 * 255));
    expect(lut[255]).toBe(Math.round(0.88 * 255));
  });

  it('passes through supplied curve control points', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.75 },
      { x: 0.5, y: 0.25 },
      { x: 1, y: 1 },
    ]);

    expect(lut[64]).toBe(Math.round(0.75 * 255));
    expect(lut[128]).toBe(Math.round(0.25 * 255));
  });

  it('treats zero folds as identity and one fold as an absolute reflection', () => {
    expect(foldTone(0.37, 0)).toBeCloseTo(0.37, 8);
    expect(foldTone(0.25, 1)).toBe(0.5);
    expect(foldTone(0.8, 1)).toBeCloseTo(0.6, 8);
    expect(buildFoldLut(0)[93]).toBe(93);
  });

  it("keeps the trophy preset's three specular peaks", () => {
    const trophy = GILDING_PRESETS.find((preset) => preset.id === 'polished-trophy');
    expect(trophy).toBeDefined();
    expect(countPeaks(buildCurveLut(trophy!.params.curvePoints))).toBe(3);
  });
});
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
