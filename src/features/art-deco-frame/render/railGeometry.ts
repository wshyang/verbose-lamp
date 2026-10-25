import * as THREE from 'three';
import type { PolylineSpec } from '../engine/frameGrammar/types';

interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  pathData: number[]; // x: normalized u (0..1), y: delay (0..0.7), z: partSide (-1..+1)
  indices: number[];
}

type Point = PolylineSpec['points'][number];

interface RailPlan {
  acc: GeometryAccumulator;
  spec: PolylineSpec;
  points: Point[];
  /** Cumulative arc length at each point, plus `totalLen` at the end. */
  cumLen: number[];
  totalLen: number;
  closed: boolean;
  ringCount: number;
  baseVertex: number;
  /** Mean x of the polyline, deciding the side of centre-straddling vertices. */
  centerX: number;
}

/** Cross-section in (lateralOffset, zOffset, normalLateral, normalZ). */
type ProfileEntry = readonly [number, number, number, number];

/** Six vertices across the front + bevels + sides — the ring size. */
const PROFILE_SIZE = 6;
const INV_SQRT2 = 0.70710678;

/** Cross-section half-extents, resolved per spec. */
interface RailSection {
  halfWidth: number;
  crestHalfWidth: number;
  frontZ: number;
  backZ: number;
}

function sectionOf(spec: PolylineSpec): RailSection {
  const halfWidth = spec.width * 0.5;
  return {
    halfWidth,
    crestHalfWidth: spec.width * 0.26,
    frontZ: spec.depth * 0.5,
    backZ: -spec.depth * 0.5,
  };
}

/**
 * The cross-section for one spec: a flat inner crest, two 45-degree chamfer
 * facets and two side walls, so light catches every 45° and 90° turn.
 */
function profileOf(section: RailSection): ProfileEntry[] {
  const { halfWidth: hw, crestHalfWidth: cw, frontZ: fz, backZ: bz } = section;
  return [
    [-hw, bz, -1, 0], // 0: outer left back
    [-hw, fz * 0.25, -INV_SQRT2, INV_SQRT2], // 1: left chamfer outer
    [-cw, fz, -0.25, 0.968], // 2: crest left edge
    [cw, fz, 0.25, 0.968], // 3: crest right edge
    [hw, fz * 0.25, INV_SQRT2, INV_SQRT2], // 4: right chamfer outer
    [hw, bz, 1, 0], // 5: outer right back
  ];
}

/** Cumulative arc length across the polyline, or `null` when it is too short. */
function measureRail(spec: PolylineSpec): { cumLen: number[]; totalLen: number; closed: boolean } | null {
  const points = spec.points;
  if (points.length < 2) return null;

  const closed = Boolean(spec.closed);
  const count = points.length;
  const segmentCount = closed ? count : count - 1;
  const cumLen: number[] = [0];
  let totalLen = 0;

  for (let i = 0; i < segmentCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    totalLen += Math.max(1e-4, Math.hypot(b.x - a.x, b.y - a.y));
    cumLen.push(totalLen);
  }

  if (totalLen < 1e-4) return null;
  return { cumLen, totalLen, closed };
}

/** Unit segment direction from `a` to `b`, with a zero guard. */
function direction(a: Point, b: Point): [number, number] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return [dx / length, dy / length];
}

/** Mitred lateral direction at one ring, clamped so tight corners do not spike. */
function miterAt(plan: RailPlan, ring: number): [number, number] {
  const { points, closed, ringCount } = plan;
  const count = points.length;
  const index = ring % count;

  if (closed || (ring > 0 && ring < ringCount - 1)) {
    const previous = points[(index - 1 + count) % count];
    const next = points[(index + 1) % count];
    const [d1x, d1y] = direction(previous, points[index]);
    const [d2x, d2y] = direction(points[index], next);
    const n1x = -d1y;
    const n1y = d1x;
    const n2x = -d2y;
    const n2y = d2x;
    let mx = n1x + n2x;
    let my = n1y + n2y;
    const miterLength = Math.hypot(mx, my);
    if (miterLength < 1e-3) return [n1x, n1y];
    mx /= miterLength;
    my /= miterLength;
    const dot = Math.max(0.38, mx * n1x + my * n1y);
    const miterScale = Math.min(2.3, 1 / dot);
    return [mx * miterScale, my * miterScale];
  }

  // Open polyline: the two end rings take the single adjacent segment.
  const [dx, dy] = ring === 0 ? direction(points[0], points[1]) : direction(points[count - 2], points[count - 1]);
  return [-dy, dx];
}

/**
 * Which half of the gate this vertex belongs to, so the two halves can part.
 * An explicit `partDir` wins; otherwise the side of the frame's centre.
 */
function partingSide(point: Point, spec: PolylineSpec, centerX: number): number {
  if (spec.partDir !== undefined && spec.partDir !== 0) return spec.partDir;
  if (point.x < -0.02) return -1;
  if (point.x > 0.02) return 1;
  return centerX < 0 ? -1 : 1;
}

/** Pushes one ring of cross-section vertices at `ring`. */
function pushRing(plan: RailPlan, ring: number) {
  const { acc, spec, points, cumLen, totalLen, centerX } = plan;
  const index = ring % points.length;
  const current = points[index];
  const [tx, ty] = miterAt(plan, ring);
  const normalLength = Math.hypot(tx, ty) || 1;
  const unitX = tx / normalLength;
  const unitY = ty / normalLength;
  const side = partingSide(current, spec, centerX);
  const u = cumLen[ring] / totalLen;

  for (const entry of profileOf(sectionOf(spec))) {
    const [lateral, zOff, normalLateral, normalZ] = entry;
    acc.positions.push(current.x + tx * lateral, current.y + ty * lateral, spec.z + zOff);
    acc.normals.push(unitX * normalLateral, unitY * normalLateral, normalZ);
    acc.pathData.push(u, spec.delay, side);
  }
}

/** Stitches consecutive rings into quads, split into triangles. */
function emitSeams(plan: RailPlan) {
  const { acc, ringCount, baseVertex } = plan;
  for (let ring = 0; ring < ringCount - 1; ring++) {
    const rowA = baseVertex + ring * PROFILE_SIZE;
    const rowB = rowA + PROFILE_SIZE;
    for (let entry = 0; entry < PROFILE_SIZE - 1; entry++) {
      const a = rowA + entry;
      const b = a + 1;
      acc.indices.push(a, rowB + entry, rowB + entry + 1, a, rowB + entry + 1, b);
    }
  }
}

/**
 * Appends a 3D chamfered 24k gold bar along a 2D polyline at plane `z`.
 * Cross-section has a flat gleaming crest + two 45-degree angled bevel facets + side walls
 * with clean mitered corner joins so light catches every 45° and 90° Art Deco turn.
 */
function appendChamferedPolyline(acc: GeometryAccumulator, spec: PolylineSpec) {
  const measured = measureRail(spec);
  if (!measured) return;

  const plan: RailPlan = {
    acc,
    spec,
    points: spec.points,
    cumLen: measured.cumLen,
    totalLen: measured.totalLen,
    closed: measured.closed,
    ringCount: measured.closed ? spec.points.length + 1 : spec.points.length,
    baseVertex: acc.positions.length / 3,
    centerX: spec.points.reduce((sum, point) => sum + point.x, 0) / spec.points.length,
  };

  for (let ring = 0; ring < plan.ringCount; ring++) pushRing(plan, ring);
  emitSeams(plan);
}

/** Shared rail extrusion for title cards and camera-attached poster borders. */
export function createChamferedFrameGeometry(specs: PolylineSpec[]): THREE.BufferGeometry {
  const acc: GeometryAccumulator = { positions: [], normals: [], pathData: [], indices: [] };
  for (const spec of specs) appendChamferedPolyline(acc, spec);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  geometry.setAttribute('aPathData', new THREE.Float32BufferAttribute(acc.pathData, 3));
  geometry.setIndex(acc.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
