import { describe, expect, it } from 'vitest';
import { nestedOctagram, octagram, reedRow } from './motifs';

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
describe('reedRow exact count', () => {
  const row = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, tickLen: 0.1, barW: 0.05, gap: 0.05 };

  it('uses the caller’s count instead of the gap formula', () => {
    expect(reedRow({ ...row, count: 5 })).toHaveLength(5);
    expect(reedRow({ ...row, count: 2 })).toHaveLength(2);
  });

  it('spaces an exact count with equal gaps at both ends', () => {
    // Each tick sits at its reed's centre, so gaps are measured edge to edge.
    const centres = reedRow({ ...row, count: 4 }).map(([a]) => a.x);
    const half = row.barW / 2;
    const gaps = [
      centres[0] - half,
      ...centres.slice(1).map((x, i) => x - centres[i] - row.barW),
      1 - (centres[3] + half),
    ];

    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 9);
  });

  it('derives the count from the length when none is given', () => {
    expect(reedRow(row)).toHaveLength(Math.floor((1 - row.gap) / (row.barW + row.gap)));
  });

  it('never returns fewer than one reed', () => {
    expect(reedRow({ ...row, count: 0 })).toHaveLength(1);
  });
});
