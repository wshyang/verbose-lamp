import type { LatticeSpec, Pt } from './lattice';

function unit(dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Exact signed octilinear offset: at a turn of θ the vertex moves along the
 * bisector by d / cos(θ/2) — 1.0824·d for 45°, √2·d for 90°. No miter clamp.
 */
export function offsetSide(points: readonly Pt[], d: number): readonly Pt[] {
  const n = points.length;
  const normals: Pt[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const u = unit(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    normals.push({ x: -u.y, y: u.x });
  }
  return points.map((p, i) => {
    const n1 = normals[Math.max(0, i - 1)];
    const n2 = normals[Math.min(normals.length - 1, i)];
    const m = unit(n1.x + n2.x, n1.y + n2.y);
    const cosHalf = m.x * n2.x + m.y * n2.y;
    const scale = d / (Math.abs(cosHalf) < 1e-6 ? 1 : cosHalf);
    return { x: p.x + m.x * scale, y: p.y + m.y * scale };
  });
}

export interface BundleOptions {
  strands: number;
  spacing: number;
  width: number;
  layer: 0 | 1 | 2 | 3;
  rank: 0 | 1 | 2 | 3;
}

/** Parallel offset strands from one centreline — the film's line bundles. */
export function bundle(centreline: readonly Pt[], opts: BundleOptions): readonly LatticeSpec[] {
  const half = (opts.strands - 1) / 2;
  return Array.from({ length: opts.strands }, (_, j) => ({
    points: offsetSide(centreline, (j - half) * opts.spacing),
    width: opts.width,
    layer: opts.layer,
    rank: opts.rank,
  }));
}