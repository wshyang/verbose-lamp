// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildGoldRampLut } from './goldRamp';

describe('ramp normalisation', () => {
  it('rejects malformed hex colours and clamps out-of-range stops', () => {
    const lut = buildGoldRampLut([
      { position: -3, color: 'not-a-colour' },
      { position: 2, color: '#fff6dc' },
    ]);
    expect(lut).toHaveLength(768);
    expect(Array.from(lut.slice(0, 3))).toEqual([42, 26, 6]);
    expect(Array.from(lut.slice(765, 768))).toEqual([255, 246, 220]);
  });

  it('falls back to the default ramp when no stop is usable', () => {
    const lut = buildGoldRampLut([{ position: Number.NaN, color: '#ffffff' }]);
    expect(Array.from(lut.slice(0, 3))).toEqual([42, 26, 6]);
    expect(Array.from(lut.slice(765, 768))).toEqual([255, 246, 220]);
  });

  it('keeps one stop per position', () => {
    const lut = buildGoldRampLut([
      { position: 0.5, color: '#111111' },
      { position: 0.5, color: '#222222' },
    ]);
    expect(lut).toHaveLength(768);
    expect(Array.from(lut.slice(380, 383))).toEqual([34, 34, 34]);
  });
});
