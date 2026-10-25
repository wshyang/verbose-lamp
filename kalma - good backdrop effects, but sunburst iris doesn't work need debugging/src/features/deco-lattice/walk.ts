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

function reserve(occupied: Set<string>, p: Pt, cell: number): void {
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      occupied.add(cellKey(p.x + dx * cell, p.y + dy * cell));
    }
  }
}

function isFree(p: Pt, o: WalkOptions, occupied: Set<string>): boolean {
  const r = Math.hypot(p.x, p.y);
  return inWedge(p) && r >= o.inner && r <= o.outer && !occupied.has(cellKey(p.x, p.y));
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
  const occupied = new Set<string>();
  const walks: Pt[][] = [];
  for (let w = 0; w < o.count; w += 1) {
    const startX = o.inner + o.cell * 2 + rng() * (o.outer - o.inner - o.cell * 4);
    let p: Pt = { x: Math.round(startX / o.cell) * o.cell, y: o.cell };
    if (!isFree(p, o, occupied)) continue;
    const pts: Pt[] = [p];
    reserve(occupied, p, o.cell);
    let dir = 2; // into the wedge, along +y
    for (let turn = 0; turn < 6; turn += 1) {
      dir = nextDir(dir, rng);
      const run = o.minRun + Math.floor(rng() * 3);
      let advanced = 0;
      for (let step = 0; step < run; step += 1) {
        const q = { x: p.x + OCTI_DIRS[dir][0] * o.cell, y: p.y + OCTI_DIRS[dir][1] * o.cell };
        if (!isFree(q, o, occupied)) break;
        p = q;
        reserve(occupied, p, o.cell);
        advanced += 1;
      }
      if (advanced === 0) break;
      pts.push(p);
    }
    if (pts.length >= 2) walks.push(pts);
  }
  return walks;
}