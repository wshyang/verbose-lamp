import type { LatticeSpec, Pt } from './lattice';

/** Integer 2×2 matrix [a, b, c, d] acting as (ax+by, cx+dy). */
export type Sym = readonly [number, number, number, number];

export const D4: readonly Sym[] = [
  [1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0],
  [1, 0, 0, -1], [-1, 0, 0, 1], [0, 1, 1, 0], [0, -1, -1, 0],
] as const;

/** Klein four-group: the exact symmetry of a non-square frame. */
export const D2: readonly Sym[] = [
  [1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1],
] as const;

export function applySym(m: Sym, p: Pt): Pt {
  return { x: m[0] * p.x + m[1] * p.y, y: m[2] * p.x + m[3] * p.y };
}

/** The fundamental domain: the wedge 0 ≤ y ≤ x. */
export function inWedge(p: Pt): boolean {
  return p.y >= -1e-9 && p.x >= p.y - 1e-9;
}

function specKey(s: LatticeSpec): string {
  const pts = s.points
    .map((p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`)
    .sort()
    .join(';');
  return `${pts}|${s.width}|${s.layer}`;
}

/**
 * Orbit under a symmetry group, deduping copies that fall on mirror lines —
 * the tutorial's "delete the unwanted extras" step, made automatic.
 */
export function orbit(specs: readonly LatticeSpec[], group: readonly Sym[]): readonly LatticeSpec[] {
  const seen = new Set<string>();
  const out: LatticeSpec[] = [];
  for (const spec of specs) {
    for (const m of group) {
      const copy: LatticeSpec = { ...spec, points: spec.points.map((p) => applySym(m, p)) };
      const key = specKey(copy);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(copy);
    }
  }
  return out;
}