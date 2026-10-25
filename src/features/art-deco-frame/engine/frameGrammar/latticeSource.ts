import { buildDecoLattice, type LatticeSpec } from '@/features/deco-lattice';
// Deep import: the pure engine must not load the deco-lattice barrel's React component.
import { brassAngleFor, toneForLayer } from '@/features/deco-lattice/model/tone';
import { clampFormulaLevel } from './styleRules';
import type { Point2, PolylineSpec, RailKind } from './types';

/**
 * The Deco Lattice family inside the frame grammar (ADDENDUM-021 §3.5). The
 * generator lives in `features/deco-lattice`; this module only translates its
 * octilinear bundles into the grammar's `PolylineSpec` and keeps the vertex
 * budget the generative suite enforces.
 */
export interface LatticeBox {
  hw: number;
  hh: number;
}

export interface LatticeSourceRequest {
  box: LatticeBox;
  /** 1..4 — tutorial layers L1..L4. */
  level: number;
  seed?: number;
  density?: number;
  /** `false` when the lattice is a composable overlay, not the foundation. */
  includePrimaryFrame?: boolean;
}

export const LATTICE_DEFAULT_SEED = 1925;
/** The Baroque vertex cap minus head-room for the monogram glyph. */
const VERTEX_BUDGET = 1000;
const DEFAULT_DENSITY = 0.62;
const DEPTH_RATIO = 1.7;
const MIN_DEPTH = 0.012;

/** Grammar kind per tutorial layer, so rank-based intricacy drops the right parts. */
export function kindForLayer(spec: LatticeSpec): RailKind {
  if (spec.layer === 0) return spec.rank === 0 ? 'frame' : 'rule';
  if (spec.layer === 1) return 'diamond';
  if (spec.layer === 2) return 'strand';
  return spec.rank >= 3 ? 'reed' : 'diamond';
}

export function toPolylineSpec(spec: LatticeSpec, seed = LATTICE_DEFAULT_SEED): PolylineSpec {
  const points: Point2[] = spec.points.map((point) => ({ x: point.x, y: point.y }));
  return {
    points,
    closed: spec.closed ?? false,
    width: spec.width,
    depth: Math.max(spec.width * DEPTH_RATIO, MIN_DEPTH),
    z: -0.04 - spec.layer * 0.1,
    delay: spec.layer * 0.12 + spec.rank * 0.02,
    kind: kindForLayer(spec),
    partDir: 0,
    tone: toneForLayer(spec.layer),
    brassAngle: brassAngleFor(seed, spec.layer),
  };
}

function vertexCount(specs: readonly PolylineSpec[]): number {
  return specs.reduce((total, spec) => total + spec.points.length, 0);
}

/**
 * Drops whole rank tiers until the budget is met. Rank-based, so the result
 * stays mirror-symmetric and every level remains a superset of the one below
 * around the primary frame.
 */
export function fitVertexBudget(specs: readonly PolylineSpec[], budget = VERTEX_BUDGET): PolylineSpec[] {
  let kept = [...specs];
  while (vertexCount(kept) > budget) {
    const maxRank = Math.max(...kept.map((spec) => spec.rank ?? 0));
    if (maxRank === 0) return kept;
    kept = kept.filter((spec) => (spec.rank ?? 0) < maxRank);
  }
  return kept;
}

/** Lattice rails for one frame extent, ready for `applyIntricacy`. */
export function buildLatticeSpecs(request: LatticeSourceRequest): PolylineSpec[] {
  const level = clampFormulaLevel(request.level);
  const seed = request.seed ?? LATTICE_DEFAULT_SEED;
  const geometry = buildDecoLattice({
    mode: 'frame',
    hw: request.box.hw,
    hh: request.box.hh,
    seed,
    density: request.density ?? DEFAULT_DENSITY,
    level,
  });
  const all = geometry.specs.map((spec) => toPolylineSpec(spec, seed));
  const foundation = request.includePrimaryFrame === false
    ? all.filter((spec) => spec.kind !== 'frame')
    : all;
  return fitVertexBudget(foundation);
}
