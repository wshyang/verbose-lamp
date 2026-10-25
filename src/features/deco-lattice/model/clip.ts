import type { LatticeSpec, Pt } from './lattice';

/**
 * Clipping for lattice apertures and text slots (ADDENDUM-021 §3.1, §3.5).
 * Pure parametric clipping: Liang–Barsky against rectangles, Cyrus–Beck
 * against convex polygons. Nothing here throws; a miss is `null`/empty.
 */

export interface ClippingRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectFromHalfExtents(hw: number, hh: number): ClippingRect {
  return { minX: -hw, minY: -hh, maxX: hw, maxY: hh };
}

const EPS = 1e-9;

function at(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

interface Interval {
  enter: number;
  exit: number;
}

/** One Liang–Barsky edge test; returns false when the segment is out. */
function clipEdge(interval: Interval, p: number, q: number): boolean {
  if (Math.abs(p) < EPS) return q >= 0;
  const r = q / p;
  if (p < 0) interval.enter = Math.max(interval.enter, r);
  else interval.exit = Math.min(interval.exit, r);
  return interval.enter <= interval.exit;
}

/** The t-interval of segment a→b lying inside the rect, or null. */
function rectInterval(a: Pt, b: Pt, rect: ClippingRect): Interval | null {
  const interval: Interval = { enter: 0, exit: 1 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: ReadonlyArray<readonly [number, number]> = [
    [-dx, a.x - rect.minX],
    [dx, rect.maxX - a.x],
    [-dy, a.y - rect.minY],
    [dy, rect.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (!clipEdge(interval, p, q)) return null;
  }
  return interval.enter <= interval.exit ? interval : null;
}

export function clipSegmentToRect(a: Pt, b: Pt, rect: ClippingRect): readonly [Pt, Pt] | null {
  const interval = rectInterval(a, b, rect);
  if (!interval) return null;
  return [at(a, b, interval.enter), at(a, b, interval.exit)];
}

function signedArea(polygon: readonly Pt[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area / 2;
}

/** Cyrus–Beck against a convex polygon of either winding. */
export function clipSegmentToConvex(
  a: Pt,
  b: Pt,
  polygon: readonly Pt[],
): readonly [Pt, Pt] | null {
  if (polygon.length < 3) return null;
  const orientation = signedArea(polygon) >= 0 ? 1 : -1;
  const interval: Interval = { enter: 0, exit: 1 };
  const d = { x: b.x - a.x, y: b.y - a.y };
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    // Inward normal for the polygon's winding: (-dy, dx) when CCW.
    const n = { x: -orientation * (q.y - p.y), y: orientation * (q.x - p.x) };
    const offset = n.x * (a.x - p.x) + n.y * (a.y - p.y);
    const denominator = n.x * d.x + n.y * d.y;
    if (!clipEdge(interval, -denominator, offset)) return null;
  }
  if (interval.enter > interval.exit) return null;
  return [at(a, b, interval.enter), at(a, b, interval.exit)];
}

function samePoint(a: Pt, b: Pt): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

/** Appends an outside run, joining it to the previous piece when contiguous. */
function pushRun(pieces: Pt[][], from: Pt, to: Pt): void {
  const last = pieces[pieces.length - 1];
  if (last && samePoint(last[last.length - 1], from)) {
    last.push(to);
    return;
  }
  pieces.push([from, to]);
}

/**
 * The parts of a polyline lying outside a rect — how a frame keeps its
 * aperture (and any text slot) clear while rails run around it.
 */
export function clipPolylineOutsideRect(
  points: readonly Pt[],
  rect: ClippingRect,
): readonly (readonly Pt[])[] {
  if (points.length < 2) return [];
  const pieces: Pt[][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const inside = rectInterval(a, b, rect);
    if (!inside) {
      pushRun(pieces, a, b);
      continue;
    }
    if (inside.enter > EPS) pushRun(pieces, a, at(a, b, inside.enter));
    if (inside.exit < 1 - EPS) pushRun(pieces, at(a, b, inside.exit), b);
  }
  return pieces;
}

/** Clips one lattice rail around a rect; a surviving closed loop stays closed. */
export function clipSpecOutsideRect(
  spec: LatticeSpec,
  rect: ClippingRect,
): readonly LatticeSpec[] {
  const path = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
  return clipPolylineOutsideRect(path, rect).map((points) => {
    const isLoop = points.length > 2 && samePoint(points[0], points[points.length - 1]);
    if (!isLoop) return { ...spec, points, closed: false };
    return { ...spec, points: points.slice(0, -1), closed: true };
  });
}
