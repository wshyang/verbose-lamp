import { describe, expect, it } from 'vitest';
import { miterAt } from './grammar';

const A = { x: 0, y: 0 };
const B = { x: 1, y: 0 };
const C = { x: 1, y: 1 };

describe('miterAt', () => {
  it('uses the single segment normal at the start of an open polyline', () => {
    expect(miterAt(null, A, B)).toEqual({ x: -0, y: 1 });
  });

  it('uses the single segment normal at the end of an open polyline', () => {
    expect(miterAt(A, B, null)).toEqual({ x: -0, y: 1 });
  });

  it('bisects the two normals at a right-angle corner and lengthens the miter by 1 / cos', () => {
    const m = miterAt(A, B, C);

    expect(m.x).toBeCloseTo(-1, 9);
    expect(m.y).toBeCloseTo(1, 9);
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(Math.SQRT2, 9);
  });

  it('keeps a straight run at unit length', () => {
    const m = miterAt(A, B, { x: 2, y: 0 });

    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1, 9);
  });

  it('falls back to the first normal when the two segments double back on each other', () => {
    expect(miterAt(A, B, A)).toEqual(miterAt(A, B, null));
  });

  it('refuses a point with no neighbour at all, since the caller never makes one', () => {
    expect(() => miterAt(null, A, null)).toThrow('at least one neighbour');
  });
});
