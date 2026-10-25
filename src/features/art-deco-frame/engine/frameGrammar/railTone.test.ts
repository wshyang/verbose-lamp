import { describe, expect, it } from 'vitest';
import { SIGNATURE_GENOME } from './genome';
import { frameFinishForStyle, latticeRailTone } from './railTone';
import type { FrameStyle } from './types';

const style = (formula: Partial<FrameStyle['formula']>): FrameStyle => ({
  intricacy: 0.5,
  formula: { source: 'authored', level: 2, genome: { ...SIGNATURE_GENOME }, ...formula },
});

describe('latticeRailTone', () => {
  it('alternates light and dark bases per tutorial layer', () => {
    expect(latticeRailTone(0, 1925).base).toBe(0.25);
    expect(latticeRailTone(1, 1925).base).toBe(0.75);
    expect(latticeRailTone(2, 1925).base).toBe(0.25);
    expect(latticeRailTone(3, 1925).base).toBe(0.75);
  });

  it('draws a seeded gradient angle in [0, π), varying by layer and seed', () => {
    for (let layer = 0; layer < 4; layer++) {
      const { angle } = latticeRailTone(layer, 1925);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI);
    }
    expect(latticeRailTone(0, 1925)).toEqual(latticeRailTone(0, 1925));
    expect(latticeRailTone(0, 1925).angle).not.toBeCloseTo(latticeRailTone(1, 1925).angle, 6);
    expect(latticeRailTone(0, 1925).angle).not.toBeCloseTo(latticeRailTone(0, 42).angle, 6);
  });
});

describe('frameFinishForStyle', () => {
  it('keeps authored and generative gold frames gold', () => {
    expect(frameFinishForStyle(style({}))).toBe('gold');
    expect(frameFinishForStyle(style({ layers: [] }))).toBe('gold');
    expect(frameFinishForStyle(style({ source: 'fractal' }))).toBe('gold');
  });

  it('finishes lattice frames (genesis or enabled layer) in brass', () => {
    expect(frameFinishForStyle(style({ source: 'lattice' }))).toBe('brass');
    expect(
      frameFinishForStyle(style({ layers: [{ source: 'lattice', enabled: true, level: 2 }] })),
    ).toBe('brass');
  });

  it('ignores disabled or non-lattice layers', () => {
    expect(
      frameFinishForStyle(style({ layers: [{ source: 'lattice', enabled: false, level: 2 }] })),
    ).toBe('gold');
    expect(
      frameFinishForStyle(style({ layers: [{ source: 'rosette', enabled: true, level: 2 }] })),
    ).toBe('gold');
  });
});
