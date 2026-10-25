import { mulberry32 } from '@/shared/lib/random';
import { OCTI_DIRS, type Pt } from './lattice';
import { inWedge } from './symmetry';

export interface WalkOptions {
  seed: number;
  cell: number;
  inner: number;
  outer: number;
  count: number;
  minRun: number;
}

function cellKey(x: number, y: number): string {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
}

/**
 * Occupancy is the set of stepped cells; a candidate cell is free when its
 * whole 3×3 neighbourhood is empty, which keeps walks one cell clear of each
 * other. The walking head and the cell it just came from are exempt —
 * without that exemption every one-cell step would land inside the head's own
 * reserved neighbourhood and no walk could ever advance.
 */
interface Occupancy {
  visited: ReadonlySet<string>;
  exempt: ReadonlySet<string>;
}

const NO_EXEMPTIONS: ReadonlySet<string> = new Set();

function isFree(p: Pt, o: WalkOptions, occupancy: Occupancy): boolean {
  const r = Math.hypot(p.x, p.y);
  if (!inWedge(p) || r < o.inner || r > o.outer) return false;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const key = cellKey(p.x + dx * o.cell, p.y + dy * o.cell);
      if (occupancy.visited.has(key) && !occupancy.exempt.has(key)) return false;
    }
  }
  return true;
}

/** Weighted turn choice: straight 0.55, ±45° 0.3, ±90° 0.15. */
function nextDir(dir: number, rng: () => number): number {
  const roll = rng();
  const turn = roll < 0.55 ? 0 : roll < 0.85 ? (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 2 : -2);
  return (dir + turn + 8) % 8;
}

/**
 * Seeded constrained walks in the wedge annulus — the tutorial's "random
 * directions", reproducible. Stops on obstacles; never throws.
 */
export function traceWalks(o: WalkOptions): readonly (readonly Pt[])[] {
  const rng = mulberry32(o.seed);
  const visited = new Set<string>();
  const walks: Pt[][] = [];
  for (let w = 0; w < o.count; w += 1) {
    const startX = o.inner + o.cell * 2 + rng() * (o.outer - o.inner - o.cell * 4);
    let p: Pt = { x: Math.round(startX / o.cell) * o.cell, y: o.cell };
    if (!isFree(p, o, { visited, exempt: NO_EXEMPTIONS })) continue;
    const pts: Pt[] = [p];
    visited.add(cellKey(p.x, p.y));
    let prev: Pt | null = null;
    let dir = 2; // into the wedge, along +y
    for (let turn = 0; turn < 6; turn += 1) {
      dir = nextDir(dir, rng);
      const run = o.minRun + Math.floor(rng() * 3);
      let advanced = 0;
      for (let step = 0; step < run; step += 1) {
        const q = { x: p.x + OCTI_DIRS[dir][0] * o.cell, y: p.y + OCTI_DIRS[dir][1] * o.cell };
        const exempt = new Set([cellKey(p.x, p.y)]);
        if (prev) exempt.add(cellKey(prev.x, prev.y));
        if (!isFree(q, o, { visited, exempt })) break;
        prev = p;
        p = q;
        visited.add(cellKey(p.x, p.y));
        advanced += 1;
      }
      if (advanced === 0) break;
      pts.push(p);
    }
    if (pts.length >= 2) walks.push(pts);
  }
  return walks;
}
