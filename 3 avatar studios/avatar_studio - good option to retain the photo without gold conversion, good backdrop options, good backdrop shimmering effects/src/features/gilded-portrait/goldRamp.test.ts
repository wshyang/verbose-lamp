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