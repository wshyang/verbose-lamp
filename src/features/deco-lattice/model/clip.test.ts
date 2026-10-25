import { describe, expect, it } from 'vitest';
import { clipPolylineOutsideRect, clipSegmentToConvex, segmentIntersectsRect } from './clip';
import type { Pt } from './lattice';

const SQUARE: readonly Pt[] = [
  { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
];
const SQUARE_CW: readonly Pt[] = [...SQUARE].reverse();

describe('clipSegmentToConvex (Cyrus–Beck)', () => {
  it('keeps a segment fully inside', () => {
    expect(clipSegmentToConvex({ a: { x: -0.5, y: 0 }, b: { x: 0.5, y: 0 }, polygon: SQUARE }))
      .toEqual([{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }]);
  });

  it('clips a crossing segment to the boundary, either winding', () => {
    const request = { a: { x: -2, y: 0 }, b: { x: 2, y: 0 } };
    expect(clipSegmentToConvex({ ...request, polygon: SQUARE }))
      .toEqual([{ x: -1, y: 0 }, { x: 1, y: 0 }]);
    expect(clipSegmentToConvex({ ...request, polygon: SQUARE_CW }))
      .toEqual([{ x: -1, y: 0 }, { x: 1, y: 0 }]);
  });

  it('clips a diagonal to a corner-to-corner run', () => {
    const clipped = clipSegmentToConvex({ a: { x: -2, y: -2 }, b: { x: 2, y: 2 }, polygon: SQUARE });
    expect(clipped).toEqual([{ x: -1, y: -1 }, { x: 1, y: 1 }]);
  });

  it('rejects segments missing the polygon, including parallels outside', () => {
    expect(clipSegmentToConvex({ a: { x: -2, y: 2 }, b: { x: 2, y: 2 }, polygon: SQUARE })).toBeNull();
    expect(clipSegmentToConvex({ a: { x: 3, y: 0 }, b: { x: 3, y: 0.5 }, polygon: SQUARE })).toBeNull();
  });

  it('handles a degenerate zero-length segment', () => {
    expect(clipSegmentToConvex({ a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, polygon: SQUARE }))
      .toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(clipSegmentToConvex({ a: { x: 5, y: 0 }, b: { x: 5, y: 0 }, polygon: SQUARE })).toBeNull();
  });
});

describe('segmentIntersectsRect', () => {
  const rect = { hw: 1, hh: 1 };
  it('detects crossing, inside and touching segments', () => {
    expect(segmentIntersectsRect({ a: { x: -2, y: 0 }, b: { x: 2, y: 0 }, rect })).toBe(true);
    expect(segmentIntersectsRect({ a: { x: 0, y: 0 }, b: { x: 0.5, y: 0 }, rect })).toBe(true);
    expect(segmentIntersectsRect({ a: { x: -2, y: 1 }, b: { x: 2, y: 1 }, rect })).toBe(true);
  });

  it('rejects segments clear of the rect', () => {
    expect(segmentIntersectsRect({ a: { x: -2, y: 2 }, b: { x: 2, y: 2 }, rect })).toBe(false);
    expect(segmentIntersectsRect({ a: { x: 2, y: -2 }, b: { x: 2, y: 2 }, rect })).toBe(false);
  });
});

describe('clipPolylineOutsideRect', () => {
  const rect = { hw: 1, hh: 1 };

  it('returns an outside polyline untouched as one piece', () => {
    const points = [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }];
    expect(clipPolylineOutsideRect({ points, rect })).toEqual([points]);
  });

  it('splits a crossing polyline around the rect', () => {
    const pieces = clipPolylineOutsideRect({ points: [{ x: -2, y: 0 }, { x: 2, y: 0 }], rect });
    expect(pieces).toEqual([
      [{ x: -2, y: 0 }, { x: -1, y: 0 }],
      [{ x: 1, y: 0 }, { x: 2, y: 0 }],
    ]);
  });

  it('drops a polyline fully inside the rect', () => {
    expect(clipPolylineOutsideRect({ points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], rect })).toEqual([]);
  });

  it('keeps the outside run of a polyline that enters and stays', () => {
    const pieces = clipPolylineOutsideRect({
      points: [{ x: -2, y: 0 }, { x: -1.5, y: 0.5 }, { x: 0, y: 0 }, { x: 0.25, y: 0.25 }],
      rect,
    });
    expect(pieces).toHaveLength(1);
    expect(pieces[0][0]).toEqual({ x: -2, y: 0 });
    expect(pieces[0]).toHaveLength(3);
  });

  it('returns nothing for fewer than two points', () => {
    expect(clipPolylineOutsideRect({ points: [], rect })).toEqual([]);
    expect(clipPolylineOutsideRect({ points: [{ x: 2, y: 2 }], rect })).toEqual([]);
  });

  it('joins consecutive outside segments into one piece', () => {
    const pieces = clipPolylineOutsideRect({
      points: [{ x: -2, y: -2 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }],
      rect,
    });
    expect(pieces).toEqual([[{ x: -2, y: -2 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }]]);
  });
});
