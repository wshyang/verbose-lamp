// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { clipPolylineOutsideRect } from './clip';

describe('clipPolylineOutsideRect', () => {
  const rect = { minX: -1, minY: -1, maxX: 1, maxY: 1 };

  it('drops a polyline fully inside the rect', () => {
    expect(clipPolylineOutsideRect([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], rect)).toEqual([]);
  });

  it('returns nothing for fewer than two points', () => {
    expect(clipPolylineOutsideRect([], rect)).toEqual([]);
    expect(clipPolylineOutsideRect([{ x: 2, y: 2 }], rect)).toEqual([]);
  });
});
