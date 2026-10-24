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