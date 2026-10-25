import { describe, expect, it } from 'vitest';
import { buildGoldRampLut, GOLD_RAMPS } from './goldRamp';

function hexChannels(hex: string): number[] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

describe('gold gradient ramps', () => {
  it('builds a 256-entry RGB lookup and hits each authored stop', () => {
    const ramp = GOLD_RAMPS.bright;
    const lut = buildGoldRampLut(ramp.stops);

    expect(lut).toHaveLength(256 * 3);
    for (const stop of ramp.stops) {
      const index = Math.round(stop.position * 255) * 3;
      expect(Array.from(lut.slice(index, index + 3))).toEqual(hexChannels(stop.color));
    }
  });

  it('keeps every shipped ramp in a warm red-gold hue family', () => {
    for (const ramp of Object.values(GOLD_RAMPS)) {
      const lut = buildGoldRampLut(ramp.stops);
      for (let index = 0; index < lut.length; index += 3) {
        expect(lut[index]).toBeGreaterThanOrEqual(lut[index + 1]);
        expect(lut[index + 1]).toBeGreaterThanOrEqual(lut[index + 2]);
      }
    }
  });
});
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
