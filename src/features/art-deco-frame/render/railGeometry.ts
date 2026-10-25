import * as THREE from 'three';
import type { PolylineSpec } from '../engine/frameGrammar/types';

interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  pathData: number[]; // x: normalized u (0..1), y: delay (0..0.7), z: partSide (-1..+1)
  /** x: brass tone 0..1, y: gradient angle in radians (ADDENDUM-021 §3.6). */
  toneData: number[];
  indices: number[];
}

const DEFAULT_TONE = 0.5;
const DEG_TO_RAD = Math.PI / 180;

const INV_SQRT2 = 0.70710678;
const MITER_PARALLEL = 1e-3;
const MITER_MAX_SCALE = 2.3;
const MIN_SEGMENT = 1e-4;
/** A rail whose mean x is within this of the centre line takes its side from the point, not the mean. */
const CENTRE_BAND = 0.02;

type ProfilePoint = readonly [lateral: number, z: number, normalLateral: number, normalZ: number];
type Vec2 = { x: number; y: number };

/**
 * The cross-section, 6 vertices across the front, bevels and sides, for crisp jewelry-grade facets:
 * a flat gleaming crest, two 45-degree chamfers and the back corners.
 */
function crossSection(spec: PolylineSpec): readonly ProfilePoint[] {
  const hw = spec.width * 0.5;
  const cw = spec.width * 0.26; // flat inner crest half-width
  const fz = spec.depth * 0.5;
  const bz = -spec.depth * 0.5;
  return [
    [-hw, bz, -1, 0],
    [-hw, fz * 0.25, -INV_SQRT2, INV_SQRT2],
    [-cw, fz, -0.25, 0.968],
    [cw, fz, 0.25, 0.968],
    [hw, fz * 0.25, INV_SQRT2, INV_SQRT2],
    [hw, bz, 1, 0],
  ];
}

/** Cumulative arc length at each ring, floored per segment so a rail of two or more points has length. */
function cumulativeLength(pts: readonly Vec2[], isClosed: boolean): number[] {
  const cumLen = [0];
  const segments = isClosed ? pts.length : pts.length - 1;
  let total = 0;
  for (let i = 0; i < segments; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.max(MIN_SEGMENT, Math.hypot(b.x - a.x, b.y - a.y));
    cumLen.push(total);
  }
  return cumLen;
}

const unit = (dx: number, dy: number): Vec2 => {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
};

/** The left-hand normal of the segment `from` to `to`. */
const normalOf = (from: Vec2, to: Vec2): Vec2 => {
  const d = unit(to.x - from.x, to.y - from.y);
  return { x: -d.y, y: d.x };
};

/** The mitred offset direction where two segments meet, scaled so both edges keep their width. */
function miter(prev: Vec2, curr: Vec2, next: Vec2): Vec2 {
  const n1 = normalOf(prev, curr);
  const n2 = normalOf(curr, next);
  const mx = n1.x + n2.x;
  const my = n1.y + n2.y;
  const ml = Math.hypot(mx, my);
  if (ml < MITER_PARALLEL) return n1;
  const ux = mx / ml;
  const uy = my / ml;
  // The original also clamped the dot product to 0.38 first. The cap binds at 1/2.3 = 0.435, so that
  // clamp could never be the active limit; it is dropped and the output is unchanged.
  const scale = Math.min(MITER_MAX_SCALE, 1.0 / (ux * n1.x + uy * n1.y));
  return { x: ux * scale, y: uy * scale };
}

interface Ring {
  pts: readonly Vec2[];
  r: number;
  ringCount: number;
  isClosed: boolean;
}

/** The offset direction at ring `r`: mitred inside the run, perpendicular to the end segment at the ends. */
function ringOffset({ pts, r, ringCount, isClosed }: Ring): Vec2 {
  const count = pts.length;
  const curr = pts[r % count];
  if (isClosed || (r > 0 && r < ringCount - 1)) {
    const idx = r % count;
    return miter(pts[(idx - 1 + count) % count], curr, pts[(idx + 1) % count]);
  }
  return r === 0 ? normalOf(curr, pts[1]) : normalOf(pts[count - 2], curr);
}

/** Which half of the gate this ring opens with: the rail's own direction, else its side of the centre. */
function partSideOf(spec: PolylineSpec, curr: Vec2, centreX: number): number {
  if (spec.partDir !== undefined && spec.partDir !== 0) return spec.partDir;
  if (curr.x < -CENTRE_BAND) return -1;
  if (curr.x > CENTRE_BAND) return 1;
  return centreX < 0 ? -1 : 1;
}

interface RingStack {
  baseVertex: number;
  ringCount: number;
  /** Vertices in one ring: the cross-section's points. */
  profN: number;
}

/** Triangles joining each ring of the cross-section to the next. */
function connectRings(acc: GeometryAccumulator, { baseVertex, ringCount, profN }: RingStack): void {
  for (let r = 0; r < ringCount - 1; r++) {
    const rowA = baseVertex + r * profN;
    const rowB = baseVertex + (r + 1) * profN;
    for (let p = 0; p < profN - 1; p++) {
      const a = rowA + p;
      const b = rowA + p + 1;
      const c = rowB + p + 1;
      const d = rowB + p;
      acc.indices.push(a, d, c, a, c, b);
    }
  }
}

/**
 * Appends a 3D chamfered 24k gold bar along a 2D polyline at plane `z`, with clean mitered corner
 * joins so light catches every 45 and 90 degree Art Deco turn.
 */
function appendChamferedPolyline(acc: GeometryAccumulator, spec: PolylineSpec): void {
  const pts = spec.points;
  if (pts.length < 2) return;

  const isClosed = Boolean(spec.closed);
  const count = pts.length;
  const cumLen = cumulativeLength(pts, isClosed);
  const totalLen = cumLen[cumLen.length - 1];
  const profile = crossSection(spec);
  const ringCount = isClosed ? count + 1 : count;
  const baseVertex = acc.positions.length / 3;
  const centreX = pts.reduce((sum, p) => sum + p.x, 0) / count;
  const tone = spec.tone ?? DEFAULT_TONE;
  const angleRad = (spec.brassAngle ?? 0) * DEG_TO_RAD;

  for (let r = 0; r < ringCount; r++) {
    const curr = pts[r % count];
    const offset = ringOffset({ pts, r, ringCount, isClosed });
    const unitOffset = unit(offset.x, offset.y);
    const uNorm = cumLen[r] / totalLen;
    const partSide = partSideOf(spec, curr, centreX);

    for (const [lat, zOff, nLat, nZ] of profile) {
      acc.positions.push(curr.x + offset.x * lat, curr.y + offset.y * lat, spec.z + zOff);
      acc.normals.push(unitOffset.x * nLat, unitOffset.y * nLat, nZ);
      acc.pathData.push(uNorm, spec.delay, partSide);
      acc.toneData.push(tone, angleRad);
    }
  }
  connectRings(acc, { baseVertex, ringCount, profN: profile.length });
}

/** Shared rail extrusion for title cards and camera-attached poster borders. */
export function createChamferedFrameGeometry(specs: PolylineSpec[]): THREE.BufferGeometry {
  const acc: GeometryAccumulator = { positions: [], normals: [], pathData: [], toneData: [], indices: [] };
  for (const spec of specs) appendChamferedPolyline(acc, spec);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geometry.setAttribute('aPathData', new THREE.Float32BufferAttribute(acc.pathData, 3));
  geometry.setAttribute('aTone', new THREE.Float32BufferAttribute(acc.toneData, 2));
  geometry.setIndex(acc.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
