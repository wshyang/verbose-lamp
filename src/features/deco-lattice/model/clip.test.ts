import { describe, expect, it } from 'vitest';
import {
  clipPolylineOutsideRect,
  clipSegmentToConvex,
  clipSegmentToRect,
  clipSpecOutsideRect,
  rectFromHalfExtents,
  type ClippingRect,
} from './clip';
import type { LatticeSpec, Pt } from './lattice';

const RECT: ClippingRect = { minX: -1, minY: -1, maxX: 1, maxY: 1 };

describe('rectFromHalfExtents', () => {
  it('builds a centred rectangle', () => {
    expect(rectFromHalfExtents(2, 0.5)).toEqual({ minX: -2, minY: -0.5, maxX: 2, maxY: 0.5 });
  });
});

describe('clipSegmentToRect', () => {
  it('keeps a segment lying inside', () => {
    expect(clipSegmentToRect({ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, RECT)).toEqual([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it('clips a crossing segment to the boundary', () => {
    const clipped = clipSegmentToRect({ x: -2, y: 0 }, { x: 2, y: 0 }, RECT);
    expect(clipped?.[0].x).toBeCloseTo(-1, 9);
    expect(clipped?.[1].x).toBeCloseTo(1, 9);
  });

  it('rejects a segment missing the rect entirely', () => {
    expect(clipSegmentToRect({ x: -2, y: 2 }, { x: 2, y: 2 }, RECT)).toBeNull();
    expect(clipSegmentToRect({ x: 2, y: -2 }, { x: 2, y: 2 }, RECT)).toBeNull();
  });

  it('handles a segment parallel outside one edge', () => {
    expect(clipSegmentToRect({ x: -0.5, y: -2 }, { x: 0.5, y: -2 }, RECT)).toBeNull();
  });
});

describe('clipSegmentToConvex', () => {
  const diamond = [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: -1, y: 0 },
  ];

  it('clips against a diamond in either winding', () => {
    for (const polygon of [diamond, [...diamond].reverse()]) {
      const clipped = clipSegmentToConvex({ x: -2, y: 0 }, { x: 2, y: 0 }, polygon);
      expect(clipped?.[0].x).toBeCloseTo(-1, 9);
      expect(clipped?.[1].x).toBeCloseTo(1, 9);
    }
  });

  it('rejects a segment missing the polygon', () => {
    expect(clipSegmentToConvex({ x: -2, y: 2 }, { x: 2, y: 2 }, diamond)).toBeNull();
  });

  it('keeps a segment fully inside', () => {
    expect(clipSegmentToConvex({ x: 0, y: 0 }, { x: 0.4, y: 0 }, diamond)).toEqual([
      { x: 0, y: 0 },
      { x: 0.4, y: 0 },
    ]);
  });
});

describe('clipPolylineOutsideRect', () => {
  it('splits a line crossing the aperture into two outside pieces', () => {
    const pieces = clipPolylineOutsideRect([{ x: -2, y: 0 }, { x: 2, y: 0 }], RECT);
    expect(pieces).toHaveLength(2);
    expect(pieces[0][1].x).toBeCloseTo(-1, 9);
    expect(pieces[1][0].x).toBeCloseTo(1, 9);
  });

  it('drops a polyline lying wholly inside', () => {
    expect(clipPolylineOutsideRect([{ x: 0, y: 0 }, { x: 0.5, y: 0 }], RECT)).toEqual([]);
  });

  it('keeps and joins a polyline lying wholly outside', () => {
    const outside = [{ x: -2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 2 }];
    expect(clipPolylineOutsideRect(outside, RECT)).toEqual([outside]);
  });

  it('returns nothing for fewer than two points', () => {
    expect(clipPolylineOutsideRect([{ x: 5, y: 5 }], RECT)).toEqual([]);
    expect(clipPolylineOutsideRect([], RECT)).toEqual([]);
  });
});

describe('clipSpecOutsideRect', () => {
  it('keeps a closed border rail that only surrounds the aperture', () => {
    const spec: LatticeSpec = {
      points: [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }],
      closed: true, width: 0.05, layer: 0, rank: 0,
    };
    const clipped = clipSpecOutsideRect(spec, RECT);
    expect(clipped).toHaveLength(1);
    expect(clipped[0].closed).toBe(true);
    expect(clipped[0].points).toHaveLength(4);
    expect(clipped[0].width).toBe(0.05);
  });

  it('opens a rail that crosses the aperture', () => {
    const spec: LatticeSpec = {
      points: [{ x: -2, y: 0 }, { x: 2, y: 0 }], width: 0.02, layer: 2, rank: 2,
    };
    const clipped = clipSpecOutsideRect(spec, RECT);
    expect(clipped).toHaveLength(2);
    expect(clipped.every((s) => !s.closed && s.layer === 2)).toBe(true);
  });
});

describe('clipSegmentToConvex degenerate polygons', () => {
  it('returns null for a polygon with fewer than three vertices', () => {
    expect(clipSegmentToConvex({ x: 0, y: 0 }, { x: 1, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull();
    expect(clipSegmentToConvex({ x: 0, y: 0 }, { x: 1, y: 0 }, [])).toBeNull();
  });
});

// Assertions ported from PR #2's clip suite that PR #5's did not cover, adapted to this API.
describe('clipSegmentToConvex edge cases', () => {
  const square: readonly Pt[] = [
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
  ];

  it('clips a diagonal to a corner-to-corner run', () => {
    expect(clipSegmentToConvex({ x: -2, y: -2 }, { x: 2, y: 2 }, square)).toEqual([
      { x: -1, y: -1 },
      { x: 1, y: 1 },
    ]);
  });

  it('keeps a zero-length segment inside and rejects one outside', () => {
    expect(clipSegmentToConvex({ x: 0, y: 0 }, { x: 0, y: 0 }, square)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(clipSegmentToConvex({ x: 5, y: 0 }, { x: 5, y: 0 }, square)).toBeNull();
  });

  it('rejects a parallel segment outside an edge and one beside the polygon', () => {
    expect(clipSegmentToConvex({ x: -2, y: 2 }, { x: 2, y: 2 }, square)).toBeNull();
    expect(clipSegmentToConvex({ x: 3, y: 0 }, { x: 3, y: 0.5 }, square)).toBeNull();
  });
});

describe('clipPolylineOutsideRect runs', () => {
  it('keeps the outside run of a polyline that enters the rect and stays', () => {
    const pieces = clipPolylineOutsideRect(
      [{ x: -2, y: 0 }, { x: -1.5, y: 0.5 }, { x: 0, y: 0 }, { x: 0.25, y: 0.25 }],
      RECT,
    );

    expect(pieces).toHaveLength(1);
    expect(pieces[0][0]).toEqual({ x: -2, y: 0 });
    expect(pieces[0]).toHaveLength(3);
  });

  it('joins consecutive outside segments into one piece', () => {
    const points = [{ x: -2, y: -2 }, { x: 0, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 0 }];

    expect(clipPolylineOutsideRect(points, RECT)).toEqual([points]);
  });
});
