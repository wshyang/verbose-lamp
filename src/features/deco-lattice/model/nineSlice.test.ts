import { describe, expect, it } from 'vitest';
import { apertureForLayout, bandCentres, nineSliceLayout } from './nineSlice';

describe('nineSliceLayout', () => {
  it('places four square D2 corners inside the frame', () => {
    const layout = nineSliceLayout({ hw: 2, hh: 1 });
    expect(layout.corners).toHaveLength(4);
    for (const corner of layout.corners) {
      expect(Math.abs(corner.cx) + corner.size / 2).toBeLessThanOrEqual(2 + 1e-9);
      expect(Math.abs(corner.cy) + corner.size / 2).toBeLessThanOrEqual(1 + 1e-9);
    }
    const xs = layout.corners.map((c) => c.cx).sort();
    expect(xs[0]).toBeCloseTo(-xs[3], 9);
  });

  it('fills each band with a whole number of periods and a centred remainder', () => {
    for (const aspect of [1, 2, 3.2]) {
      const layout = nineSliceLayout({ hw: aspect, hh: 1, period: 0.3 });
      for (const band of [layout.horizontal, layout.vertical]) {
        expect(Number.isInteger(band.periods)).toBe(true);
        expect(band.periods * 0.3).toBeLessThanOrEqual(band.length + 1e-9);
        expect(band.remainder).toBeCloseTo(band.length - band.periods * 0.3, 9);
        expect(band.remainder).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('centres band tile positions symmetrically about the middle', () => {
    const layout = nineSliceLayout({ hw: 2.4, hh: 1, period: 0.25 });
    const centres = bandCentres(layout.horizontal);
    expect(centres.length).toBe(layout.horizontal.periods);
    for (let i = 0; i < centres.length; i++) {
      expect(centres[i]).toBeCloseTo(-centres[centres.length - 1 - i], 9);
    }
  });

  it('leaves an empty tile list when the band is shorter than one period', () => {
    const layout = nineSliceLayout({ hw: 0.4, hh: 0.4, period: 5 });
    expect(layout.horizontal.periods).toBe(0);
    expect(bandCentres(layout.horizontal)).toEqual([]);
  });

  it('sanitises bad dimensions instead of producing NaNs', () => {
    const layout = nineSliceLayout({ hw: Number.NaN, hh: -3, cornerRatio: 99, period: 0 });
    expect(Number.isFinite(layout.cornerSize)).toBe(true);
    expect(layout.cornerSize).toBeGreaterThan(0);
    expect(layout.horizontal.period).toBeGreaterThan(0);
  });

  it('derives a clear interior aperture from the layout', () => {
    const layout = nineSliceLayout({ hw: 2, hh: 1 });
    const aperture = apertureForLayout(layout, { hw: 2, hh: 1 });
    expect(aperture.hw).toBeLessThan(2);
    expect(aperture.hh).toBeLessThan(1);
    expect(aperture.hw).toBeGreaterThan(0);
    expect(aperture.hh).toBeGreaterThan(0);
  });
});

describe('nineSliceLayout ratio fallback', () => {
  it('falls back to the 0.62 corner ratio for a non-finite request', () => {
    const layout = nineSliceLayout({ hw: 2, hh: 1, cornerRatio: Number.NaN, period: 0.2 });
    expect(layout.cornerSize).toBeCloseTo(0.62, 12);
  });
});
