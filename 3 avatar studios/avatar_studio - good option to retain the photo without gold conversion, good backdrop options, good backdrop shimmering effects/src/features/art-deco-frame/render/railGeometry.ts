import * as THREE from 'three';
import type { PolylineSpec } from '../engine/frameGrammar/types';

interface GeometryAccumulator {
  positions: number[];
  normals: number[];
  pathData: number[]; // x: normalized u (0..1), y: delay (0..0.7), z: partSide (-1..+1)
  indices: number[];
}

/**
 * Appends a 3D chamfered 24k gold bar along a 2D polyline at plane `z`.
 * Cross-section has a flat gleaming crest + two 45-degree angled bevel facets + side walls
 * with clean mitered corner joins so light catches every 45° and 90° Art Deco turn.
 */
function appendChamferedPolyline(acc: GeometryAccumulator, spec: PolylineSpec) {
  const pts = spec.points;
  if (pts.length < 2) return;

  const isClosed = Boolean(spec.closed);
  const count = pts.length;

  // Compute cumulative arc length for normalized uProgress [0..1]
  const cumLen: number[] = [0];
  let totalLen = 0;
  const segCount = isClosed ? count : count - 1;

  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    totalLen += Math.max(1e-4, d);
    cumLen.push(totalLen);
  }

  if (totalLen < 1e-4) return;

  // Cross-section profile in (lateralOffset, zOffset, normalLateral, normalZ)
  // 6 vertices across the front + bevels + sides for crisp jewelry-grade facets:
  const hw = spec.width * 0.5;
  const cw = spec.width * 0.26; // flat inner crest half-width
  const fz = spec.depth * 0.5;
  const bz = -spec.depth * 0.5;
  const invSqrt2 = 0.70710678;

  const profile: Array<[number, number, number, number]> = [
    [-hw, bz, -1, 0],                   // 0: outer left back
    [-hw, fz * 0.25, -invSqrt2, invSqrt2], // 1: left chamfer outer
    [-cw, fz, -0.25, 0.968],            // 2: crest left edge
    [cw, fz, 0.25, 0.968],              // 3: crest right edge
    [hw, fz * 0.25, invSqrt2, invSqrt2],   // 4: right chamfer outer
    [hw, bz, 1, 0],                     // 5: outer right back
  ];
  const profN = profile.length;

  const ringCount = isClosed ? count + 1 : count;
  const baseVertex = acc.positions.length / 3;

  // Determine parting direction for theatrical gate opening
  let centerX = 0;
  for (const p of pts) centerX += p.x;
  centerX /= pts.length;

  for (let r = 0; r < ringCount; r++) {
    const idx = r % count;
    const curr = pts[idx];

    // Compute miter normal in XY plane
    let tx = 0;
    let ty = 0;

    if (isClosed || (r > 0 && r < ringCount - 1)) {
      const prev = pts[(idx - 1 + count) % count];
      const next = pts[(idx + 1) % count];
      let d1x = curr.x - prev.x;
      let d1y = curr.y - prev.y;
      const l1 = Math.hypot(d1x, d1y) || 1;
      d1x /= l1;
      d1y /= l1;

      let d2x = next.x - curr.x;
      let d2y = next.y - curr.y;
      const l2 = Math.hypot(d2x, d2y) || 1;
      d2x /= l2;
      d2y /= l2;

      const n1x = -d1y;
      const n1y = d1x;
      const n2x = -d2y;
      const n2y = d2x;

      let mx = n1x + n2x;
      let my = n1y + n2y;
      const ml = Math.hypot(mx, my);
      if (ml < 1e-3) {
        tx = n1x;
        ty = n1y;
      } else {
        mx /= ml;
        my /= ml;
        const dot = Math.max(0.38, mx * n1x + my * n1y);
        const miterScale = Math.min(2.3, 1.0 / dot);
        tx = mx * miterScale;
        ty = my * miterScale;
      }
    } else if (r === 0) {
      const next = pts[1];
      const dx = next.x - curr.x;
      const dy = next.y - curr.y;
      const l = Math.hypot(dx, dy) || 1;
      tx = -dy / l;
      ty = dx / l;
    } else {
      const prev = pts[count - 2];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const l = Math.hypot(dx, dy) || 1;
      tx = -dy / l;
      ty = dx / l;
    }

    const uNorm = cumLen[r] / totalLen;
    const partSide =
      spec.partDir !== undefined && spec.partDir !== 0
        ? spec.partDir
        : curr.x < -0.02
          ? -1
          : curr.x > 0.02
            ? 1
            : centerX < 0
              ? -1
              : 1;

    // Normalize lateral direction for accurate normals
    const nLen = Math.hypot(tx, ty) || 1;
    const unx = tx / nLen;
    const uny = ty / nLen;

    for (let p = 0; p < profN; p++) {
      const [lat, zOff, nLat, nZ] = profile[p];
      acc.positions.push(curr.x + tx * lat, curr.y + ty * lat, spec.z + zOff);
      acc.normals.push(unx * nLat, uny * nLat, nZ);
      acc.pathData.push(uNorm, spec.delay, partSide);
    }
  }

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
