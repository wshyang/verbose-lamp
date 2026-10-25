import type { Pt } from './lattice';

/**
 * Convex clipping for apertures and text slots (ADDENDUM-021 §3.1).
 * All rects are centred on the origin, like every lattice composition.
 */

export interface CentredRect {
  hw: number;
  hh: number;
}

export interface SegmentQuery {
  a: Pt;
  b: Pt;
  polygon: readonly Pt[];
}

const EPS = 1e-12;

function signedArea(polygon: readonly Pt[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

function pointAt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Cyrus–Beck clip of a segment against a convex polygon (either winding). */
export function clipSegmentToConvex({ a, b, polygon }: SegmentQuery): readonly [Pt, Pt] | null {
  const winding = signedArea(polygon) < 0 ? -1 : 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let tEnter = 0;
  let tLeave = 1;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const nx = -(q.y - p.y) * winding;
    const ny = (q.x - p.x) * winding;
    const numerator = nx * (a.x - p.x) + ny * (a.y - p.y);
    const denominator = nx * dx + ny * dy;
    if (Math.abs(denominator) < EPS) {
      if (numerator < 0) return null;
      continue;
    }
    const t = -numerator / denominator;
    if (denominator > 0) tEnter = Math.max(tEnter, t);
    else tLeave = Math.min(tLeave, t);
    if (tEnter > tLeave) return null;
  }
  return [pointAt(a, b, tEnter), pointAt(a, b, tLeave)];
}

function rectPolygon(rect: CentredRect): readonly Pt[] {
  return [
    { x: -rect.hw, y: -rect.hh }, { x: rect.hw, y: -rect.hh },
    { x: rect.hw, y: rect.hh }, { x: -rect.hw, y: rect.hh },
  ];
}

export interface RectSegmentQuery {
  a: Pt;
  b: Pt;
  rect: CentredRect;
}

export function segmentIntersectsRect({ a, b, rect }: RectSegmentQuery): boolean {
  return clipSegmentToConvex({ a, b, polygon: rectPolygon(rect) }) !== null;
}

/** Parametric interval of the segment inside the rect, or null when clear. */
function insideInterval(a: Pt, b: Pt, rect: CentredRect): readonly [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const slabs = [
    { start: a.x, delta: b.x - a.x, bound: rect.hw },
    { start: a.y, delta: b.y - a.y, bound: rect.hh },
  ];
  for (const slab of slabs) {
    if (Math.abs(slab.delta) < EPS) {
      if (Math.abs(slab.start) > slab.bound) return null;
      continue;
    }
    const ta = (-slab.bound - slab.start) / slab.delta;
    const tb = (slab.bound - slab.start) / slab.delta;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
  }
  return t1 - t0 > EPS ? [t0, t1] : null;
}

function outsideSegments(a: Pt, b: Pt, rect: CentredRect): Array<readonly [Pt, Pt]> {
  const inside = insideInterval(a, b, rect);
  if (inside === null) return [[a, b]];
  const pieces: Array<readonly [Pt, Pt]> = [];
  if (inside[0] > EPS) pieces.push([a, pointAt(a, b, inside[0])]);
  if (inside[1] < 1 - EPS) pieces.push([pointAt(a, b, inside[1]), b]);
  return pieces;
}

const samePoint = (p: Pt, q: Pt): boolean =>
  Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;

export interface ClipOutsideQuery {
  points: readonly Pt[];
  rect: CentredRect;
}

/**
 * The portions of a polyline outside a centred rect, as joined pieces.
 * This is how a frame keeps its typography aperture clear.
 */
export function clipPolylineOutsideRect({ points, rect }: ClipOutsideQuery): Pt[][] {
  const pieces: Pt[][] = [];
  let current: Pt[] = [];
  const flush = (): void => {
    if (current.length >= 2) pieces.push(current);
    current = [];
  };
  for (let i = 1; i < points.length; i += 1) {
    const subs = outsideSegments(points[i - 1], points[i], rect);
    if (subs.length === 0) flush();
    subs.forEach(([p, q], index) => {
      if (index > 0) flush();
      if (current.length > 0 && samePoint(current[current.length - 1], p)) current.push(q);
      else {
        flush();
        current = [p, q];
      }
    });
  }
  flush();
  return pieces;
}
