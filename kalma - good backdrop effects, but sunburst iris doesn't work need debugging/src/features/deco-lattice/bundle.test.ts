import { describe, expect, it } from 'vitest';
import { bundle, offsetSide } from './bundle';
import { isOctilinear } from './lattice';

describe('offsetSide', () => {
  it('keeps exact perpendicular spacing through a 45° turn', () => {
    const d = 0.02;
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }];
    const off = offsetSide(line, d);
    // First segment lies on y = d.
    expect(off[0].y).toBeCloseTo(d, 12);
    // Second segment lies on x − y = 1 − d√2 (perpendicular distance d).
    expect(off[1].x - off[1].y).toBeCloseTo(1 - d * Math.SQRT2, 12);
    expect(off[2].x - off[2].y).toBeCloseTo(1 - d * Math.SQRT2, 12);
    expect(isOctilinear(off)).toBe(true);
  });

  it('moves a 90° corner vertex by √2·d along the bisector', () => {
    const d = 0.03;
    const line = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    const off = offsetSide(line, d);
    expect(Math.hypot(off[1].x - 1, off[1].y - 0)).toBeCloseTo(d * Math.SQRT2, 12);
  });

  it('bundle emits the requested number of parallel strands', () => {
    const specs = bundle([{ x: 0, y: 0 }, { x: 1, y: 0 }], {
      strands: 3, spacing: 0.02, width: 0.006, layer: 2, rank: 2,
    });
    expect(specs.length).toBe(3);
    expect(specs[0].points[0].y).toBeCloseTo(-0.02);
    expect(specs[2].points[0].y).toBeCloseTo(0.02);
  });
});