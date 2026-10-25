export interface Pt {
  x: number;
  y: number;
}

/** The 8 octilinear step directions; diagonals use (±1, ±1) lattice steps. */
export const OCTI_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
] as const;

export function snapToLattice(p: Pt, u: number): Pt {
  return { x: Math.round(p.x / u) * u, y: Math.round(p.y / u) * u };
}

/** Every segment must run at 0°, 45° or 90°. */
export function isOctilinear(points: readonly Pt[], eps = 1e-6): boolean {
  for (let i = 1; i < points.length; i += 1) {
    const dx = Math.abs(points[i].x - points[i - 1].x);
    const dy = Math.abs(points[i].y - points[i - 1].y);
    if (dx < eps || dy < eps) continue;
    if (Math.abs(dx - dy) > eps) return false;
  }
  return true;
}

export interface LatticeSpec {
  points: readonly Pt[];
  closed?: boolean;
  width: number;
  /** Tutorial layer 0..3 — drives brass gradient angle and drop shadow. */
  layer: 0 | 1 | 2 | 3;
  /** Importance 0 (essential) .. 3 (flourish); intricacy drops rank 3 first. */
  rank: 0 | 1 | 2 | 3;
}