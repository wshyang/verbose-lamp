import { describe, expect, it } from 'vitest';
import { decomposeNineSlice, friezePeriods } from './nineSlice';

describe('decomposeNineSlice (ADDENDUM-021 §3.4)', () => {
  it('splits a wide frame into square corners, frieze edges and a clear aperture', () => {
    const slice = decomposeNineSlice({ hw: 3.2, hh: 1 });
    expect(slice.cornerSize).toBeCloseTo(0.32 * 2 * 1 / 2 + 0.32, 10);
    expect(slice.corners).toHaveLength(4);
    for (const corner of slice.corners) {
      expect(corner.hw).toBeCloseTo(corner.hh, 12);
      expect(Math.abs(corner.cx) + corner.hw).toBeCloseTo(3.2, 10);
      expect(Math.abs(corner.cy) + corner.hh).toBeCloseTo(1, 10);
    }
    expect(slice.aperture.hw).toBeLessThan(3.2);
    expect(slice.aperture.hh).toBeLessThan(1);
    expect(slice.topEdge.hw).toBeCloseTo(slice.aperture.hw, 10);
    expect(slice.leftEdge.hh).toBeCloseTo(slice.aperture.hh, 10);
  });

  it('is D2-exact for aspects 1, 2 and 3.2', () => {
    for (const aspect of [1, 2, 3.2]) {
      const slice = decomposeNineSlice({ hw: aspect, hh: 1 });
      const xs = slice.corners.map((c) => c.cx).sort((a, b) => a - b);
      const ys = slice.corners.map((c) => c.cy).sort((a, b) => a - b);
      expect(xs[0]).toBeCloseTo(-xs[3], 12);
      expect(xs[1]).toBeCloseTo(xs[0], 12);
      expect(ys[0]).toBeCloseTo(-ys[3], 12);
      expect(slice.topEdge.cy).toBeCloseTo(-slice.bottomEdge.cy, 12);
      expect(slice.leftEdge.cx).toBeCloseTo(-slice.rightEdge.cx, 12);
    }
  });

  it('honours an explicit corner ratio and clamps silly ratios', () => {
    expect(decomposeNineSlice({ hw: 2, hh: 1, cornerRatio: 0.5 }).cornerSize).toBe(1);
    expect(decomposeNineSlice({ hw: 2, hh: 1, cornerRatio: 9 }).cornerSize).toBeLessThanOrEqual(2);
    expect(decomposeNineSlice({ hw: 2, hh: 1, cornerRatio: -1 }).cornerSize).toBeGreaterThanOrEqual(0);
  });
});

describe('friezePeriods', () => {
  it('fills a band with whole periods and centres the remainder', () => {
    expect(friezePeriods({ length: 10, period: 3 })).toEqual({ count: 3, remainder: 1 });
    expect(friezePeriods({ length: 9, period: 3 })).toEqual({ count: 3, remainder: 0 });
    expect(friezePeriods({ length: 2, period: 3 })).toEqual({ count: 0, remainder: 2 });
  });

  it('never returns a fractional count for any aspect', () => {
    for (const length of [0.5, 1, 2.36, 3.2, 17.9]) {
      const { count, remainder } = friezePeriods({ length, period: 0.7 });
      expect(Number.isInteger(count)).toBe(true);
      expect(count * 0.7 + remainder).toBeCloseTo(length, 10);
      expect(remainder).toBeGreaterThanOrEqual(0);
    }
  });

  it('guards a non-positive period', () => {
    expect(friezePeriods({ length: 4, period: 0 })).toEqual({ count: 0, remainder: 4 });
  });
});
