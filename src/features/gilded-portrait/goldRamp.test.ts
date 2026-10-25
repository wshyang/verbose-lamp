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
describe('buildGoldRampLut degenerate stops', () => {
  it('uses the house seed ramp when no stops survive', () => {
    const lut = buildGoldRampLut([]);
    expect([...lut.slice(0, 3)]).toEqual([42, 26, 6]);
    expect([...lut.slice(-3)]).toEqual([255, 246, 220]);
    expect(buildGoldRampLut([{ position: Number.NaN, color: '#000000' }])).toEqual(lut);
  });

  it('lets the last stop win at a repeated position and pads both ends', () => {
    const lut = buildGoldRampLut([
      { position: 0.5, color: '#000000' },
      { position: 0.5, color: '#ffffff' },
    ]);
    expect(lut.every((value) => value === 255)).toBe(true);
  });

  it('paints flat from one stop and falls back to the seed colour for bad hex', () => {
    const flat = buildGoldRampLut([{ position: 0, color: '#102030' }]);
    expect([...flat.slice(0, 3)]).toEqual([16, 32, 48]);
    expect([...flat.slice(-3)]).toEqual([16, 32, 48]);
    const bad = buildGoldRampLut([{ position: 0, color: 'banana' }, { position: 1, color: '#fff6dc' }]);
    expect([...bad.slice(0, 3)]).toEqual([42, 26, 6]);
  });
});
