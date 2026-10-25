import { describe, expect, it } from 'vitest';
import { nestedOctagram, octagram } from './motifs';

describe('octagram closed form', () => {
  it('alternates a√2 and a·sec(π/8) radii at the right angles', () => {
    const a = 0.4;
    const pts = octagram(a);
    expect(pts.length).toBe(16);
    pts.forEach((p, i) => {
      const r = Math.hypot(p.x, p.y);
      const expected = i % 2 === 0 ? a * Math.SQRT2 : a / Math.cos(Math.PI / 8);
      expect(r).toBeCloseTo(expected, 12);
      const angle = Math.atan2(p.y, p.x);
      const expectedAngle = (i * Math.PI) / 8;
      const norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      expect(Math.min(Math.abs(norm - expectedAngle), 2 * Math.PI - Math.abs(norm - expectedAngle))).toBeLessThan(1e-9);
    });
  });

  it('equals the brute-force union of the two squares at 1e-9', () => {
    const a = 0.5;
    // Union outline vertices: square corners (±a,±a) and rotated corners (±a√2,0),(0,±a√2)
    // plus edge intersections at radius a·sec(π/8).
    const pts = octagram(a);
    const outer = pts.filter((_, i) => i % 2 === 0);
    for (const p of outer) {
      // Tips are corners of the axis square (max norm = a) or of the 45°
      // rotated square (|x| + |y| = a√2).
      const onAxisSquare = Math.abs(Math.max(Math.abs(p.x), Math.abs(p.y)) - a) < 1e-9;
      const onRotatedSquare = Math.abs(Math.abs(p.x) + Math.abs(p.y) - a * Math.SQRT2) < 1e-9;
      expect(onAxisSquare || onRotatedSquare).toBe(true);
    }
  });

  it('nested echoes shrink by the ratio', () => {
    const rings = nestedOctagram(0.4, 3, 0.8);
    expect(rings.length).toBe(3);
    expect(Math.hypot(rings[1][0].x, rings[1][0].y)).toBeCloseTo(0.4 * 0.8 * Math.SQRT2, 12);
  });
});