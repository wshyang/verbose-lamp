// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildGoldRampLut } from './goldRamp';

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
