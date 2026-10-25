import {
  buildDecoLattice,
  clipPolylineOutsideRect,
  segmentIntersectsRect,
  type LatticeSpec,
} from '@/features/deco-lattice';
import { hash01 } from '@/shared/lib/random';
import type { Point2, PolylineSpec, RailKind } from './types';

/**
 * Deco Lattice as a title-card genesis source (ADDENDUM-021 §3.5): converts
 * the standalone lattice generator's specs into frame-grammar rails, keeps
 * the typography aperture clear by clipping, and carries the tutorial layer
 * through as rank, draw-on delay, z depth and brass tone.
 */

export interface LatticeBox {
  hw: number;
  hh: number;
}

export const DEFAULT_LATTICE_SEED = 1925;
export const DEFAULT_LATTICE_DENSITY = 0.6;

const DEPTH = 0.09;
const Z_PER_LAYER = -0.07;
const DELAY_PER_LAYER = 0.12;

/** The centre rectangle title typography owns; lattice rails never enter it. */
export function latticeAperture(box: LatticeBox): LatticeBox {
  return { hw: box.hw * 0.62, hh: box.hh * 0.55 };
}

function kindFor(spec: LatticeSpec): RailKind {
  if (spec.layer === 1) return 'octagram';
  if (spec.layer === 3) return spec.points.length > 2 ? 'diamond' : 'reed';
  if (spec.layer === 0) return spec.rank === 0 ? 'frame' : 'rule';
  return 'lattice-strand';
}

/** Stable key shared by x-mirrored copies, so seeded jitter stays symmetric. */
function symmetricKey(spec: LatticeSpec): number {
  const rounded = spec.points
    .map((p) => `${Math.round(Math.abs(p.x) * 1e4)},${Math.round(Math.abs(p.y) * 1e4)}`)
    .sort()
    .join('|');
  let hash = 0;
  for (let i = 0; i < rounded.length; i += 1) {
    hash = (Math.imul(hash, 31) + rounded.charCodeAt(i)) | 0;
  }
  return hash;
}

function intersectsAperture(points: readonly Point2[], closed: boolean, aperture: LatticeBox): boolean {
  const loop = closed ? [...points, points[0]] : points;
  for (let i = 1; i < loop.length; i += 1) {
    if (segmentIntersectsRect({ a: loop[i - 1], b: loop[i], rect: aperture })) return true;
  }
  return false;
}

interface RailDraft {
  spec: LatticeSpec;
  points: Point2[];
  closed: boolean;
}

/** Frame-mode rails clipped around the aperture; untouched rails stay closed. */
function clippedDrafts(spec: LatticeSpec, aperture: LatticeBox): RailDraft[] {
  const points = spec.points.map((p) => ({ x: p.x, y: p.y }));
  const closed = Boolean(spec.closed);
  if (!intersectsAperture(points, closed, aperture)) return [{ spec, points, closed }];
  // Closed rails clip as a loop: append the first point (slice length 1) or nothing (0).
  const loop = points.concat(points.slice(0, Number(closed)));
  return clipPolylineOutsideRect({ points: loop, rect: aperture })
    .map((piece) => ({ spec, points: piece, closed: false }));
}

function toRail(draft: RailDraft, seed: number): PolylineSpec {
  const { spec } = draft;
  const jitter = hash01(symmetricKey(spec), seed);
  const isFine = spec.rank >= 2;
  return {
    points: draft.points,
    closed: draft.closed,
    width: spec.width * (isFine ? 0.9 + jitter * 0.2 : 1),
    depth: DEPTH,
    z: spec.layer * Z_PER_LAYER,
    delay: spec.layer * DELAY_PER_LAYER + jitter * 0.03,
    kind: kindFor(spec),
    rank: spec.rank,
    tone: Math.min(1, Math.max(0, spec.layer / 3 + (jitter - 0.5) * 0.2)),
  };
}

export interface LatticeRailsQuery {
  box: LatticeBox;
  level: number;
  seed?: number;
  density?: number;
  mode?: 'medallion' | 'frame';
}

export function buildLatticeRails(query: LatticeRailsQuery): PolylineSpec[] {
  const mode = query.mode ?? 'frame';
  const seed = query.seed ?? DEFAULT_LATTICE_SEED;
  const geometry = buildDecoLattice({
    mode,
    hw: query.box.hw,
    hh: query.box.hh,
    seed,
    density: query.density ?? DEFAULT_LATTICE_DENSITY,
    level: Math.min(4, Math.max(1, Math.round(query.level))),
  });
  if (mode === 'medallion') {
    return geometry.specs.map((spec) => toRail(
      { spec, points: spec.points.map((p) => ({ x: p.x, y: p.y })), closed: Boolean(spec.closed) },
      seed,
    ));
  }
  const aperture = latticeAperture(query.box);
  return geometry.specs.flatMap((spec) =>
    clippedDrafts(spec, aperture).map((draft) => toRail(draft, seed)));
}
