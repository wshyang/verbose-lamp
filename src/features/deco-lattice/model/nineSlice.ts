import type { LatticeSpec, Pt } from './lattice';
import { cornerDiamond, reedRow, trapezoidClasp } from './motifs';
import { D2, D4, orbit } from './symmetry';

/**
 * Nine-slice rectangle support (ADDENDUM-021 §3.4).
 *
 * D4 only holds for squares, so a non-square frame is decomposed into four
 * square corner blocks, four 1D frieze bands and a clear centre:
 *
 * - **Corners** are generated inside one square block with full D4 symmetry and
 *   then placed into all four corners by the D2 orbit, so a 3.2:1 viewport is as
 *   exact as a 1:1 medallion.
 * - **Edges** are built on the half band and mirrored. The repeat count is
 *   chosen first and the period derived from it, so every count is an integer
 *   by construction and no reed is ever clipped.
 * - **The clasp** takes the space reserved at mid-edge, which is why a band never
 *   ends on a fragment.
 *
 * Everything is octilinear: horizontal, vertical or 45°.
 */
export interface NineSliceRequest {
  /** Half extents of the rectangle the border belongs to. */
  hw: number;
  hh: number;
  /** 1..4 — each level is a superset of the one below. */
  level?: number;
  /** 0..1 — reed density and rail count. */
  density?: number;
  /** Corner block side as a fraction of the shorter half extent. */
  cornerRatio?: number;
  /** Clear aperture. The border is pulled outside it when one is given. */
  aperture?: { hw: number; hh: number };
}

export interface NineSliceCounts {
  /** Reeds on each half of the long (top/bottom) edge. */
  long: number;
  /** Reeds on each half of the short (left/right) edge. */
  short: number;
}

export interface NineSliceGeometry {
  specs: readonly LatticeSpec[];
  /** Corner block side actually used. */
  corner: number;
  /** Integer reed counts per half band. */
  counts: NineSliceCounts;
  /** The aperture the border promises to keep clear. */
  aperture: { hw: number; hh: number };
  bounds: { hw: number; hh: number };
}

const DEFAULT_LEVEL = 4;
const DEFAULT_DENSITY = 0.5;
const DEFAULT_CORNER_RATIO = 0.3;
const MAX_CORNER_RATIO = 0.45;
const MIN_CORNER = 0.05;
const TARGET_REED_PERIOD = 0.055;
const MIN_REEDS = 2;
const CLASP_FRACTION = 0.5;
const MIN_APERTURE_MARGIN = 0.05;
const CORNER_MOTIF_INSET = 0.58;
const CORNER_ECHO_SCALE = 0.44;
const STEP_SHOULDER = 0.16;
const DENSITY_STEP_GATE = 0.55;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Six-decimal rounding; exact 0 on a mirror line so dedupe keys agree. */
function n(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) || Math.abs(rounded) < 1e-9 ? 0 : rounded;
}

function map(points: readonly Pt[], fn: (p: Pt) => Pt): Pt[] {
  return points.map((p) => {
    const next = fn(p);
    return { x: n(next.x), y: n(next.y) };
  });
}

const reflectX = (points: readonly Pt[]) => map(points, (p) => ({ x: -p.x, y: p.y }));
const reflectY = (points: readonly Pt[]) => map(points, (p) => ({ x: p.x, y: -p.y }));
const translate = (points: readonly Pt[], dx: number, dy: number) =>
  map(points, (p) => ({ x: p.x + dx, y: p.y + dy }));
/** 90° counter-clockwise: (x, y) → (−y, x). */
const rotate90 = (points: readonly Pt[]) => map(points, (p) => ({ x: -p.y, y: p.x }));

function rail(
  points: readonly Pt[],
  width: number,
  layer: LatticeSpec['layer'],
  rank: LatticeSpec['rank'],
  closed = false
): LatticeSpec {
  return { points: map(points, (p) => p), width: n(width), layer, rank, closed };
}

/** Closed rectangle as one rail. */
function box(hw: number, hh: number, width: number, layer: LatticeSpec['layer'], rank: LatticeSpec['rank']): LatticeSpec {
  return rail(
    [
      { x: -hw, y: hh },
      { x: hw, y: hh },
      { x: hw, y: -hh },
      { x: -hw, y: -hh },
    ],
    width,
    layer,
    rank,
    true
  );
}

/**
 * One corner block's contents, drawn about the block's own centre so the D4
 * orbit stays inside the block. The stepped shoulder is anchored at the block's
 * inner corner and added after the orbit, because it is a corner motif, not a
 * rotationally symmetric one.
 */
function cornerMotifs(c: number, density: number, level: number): readonly LatticeSpec[] {
  const r = c * CORNER_MOTIF_INSET * 0.5;
  const local: LatticeSpec[] = [rail(cornerDiamond({ x: 0, y: 0 }, r), 0.011, 3, 2, true)];
  if (level >= 4) {
    local.push(rail(cornerDiamond({ x: 0, y: 0 }, r * CORNER_ECHO_SCALE), 0.007, 3, 3, true));
  }
  const orbited = orbit(local, D4);

  const shoulder: LatticeSpec[] = [];
  if (density > DENSITY_STEP_GATE) {
    const s = c * STEP_SHOULDER;
    const i = -c / 2;
    shoulder.push(
      rail(
        [
          { x: i, y: i + s },
          { x: i + s, y: i + s },
          { x: i + s, y: i },
        ],
        0.006,
        3,
        3
      )
    );
  }
  return [...orbited, ...shoulder];
}

/** The four corner blocks, placed by the D2 orbit, so the frame is D2-exact. */
function corners(c: number, hw: number, hh: number, density: number, level: number): readonly LatticeSpec[] {
  const block = cornerMotifs(c, density, level).map((spec): LatticeSpec => ({
    ...spec,
    points: translate(spec.points, hw - c / 2, hh - c / 2),
  }));
  return orbit(block, D2);
}

interface BandPlan {
  /** Reeds per half band — the integer the whole band is derived from. */
  reps: number;
  /** Longitudinal pitch, chosen so `reps` periods plus the clasp fit exactly. */
  period: number;
  /** Half-span reserved at mid-edge for the clasp. */
  claspHalf: number;
}

export function planBand(run: number, density: number): BandPlan {
  const target = TARGET_REED_PERIOD * (1.3 - 0.45 * clamp01(density));
  const wanted = Math.max(MIN_REEDS, Math.round(run / target));
  const claspHalf = Math.min(run * 0.2, (run / wanted) * CLASP_FRACTION * 0.5);
  const usable = run - claspHalf;
  return { reps: wanted, period: usable / wanted, claspHalf: Math.max(claspHalf, 1e-4) };
}

/** Equal-gap reeds for the half band `[claspHalf, run]`, with an exact count. */
function halfReeds(run: number, plan: BandPlan, tick: number): Pt[][] {
  const bar = plan.period * 0.55;
  return reedRow({
    from: { x: plan.claspHalf, y: 0 },
    to: { x: run, y: 0 },
    tickLen: tick,
    barW: bar,
    gap: plan.period - bar,
    count: plan.reps,
  }).map((pair) => map(pair, (p) => p));
}

/**
 * A band on the top edge at `y`, built from the half band and mirrored so it is
 * exactly symmetric about x = 0, with the clasp centred at mid-edge.
 */
function edgeBand(run: number, plan: BandPlan, y: number, tick: number, density: number): LatticeSpec[] {
  const out: LatticeSpec[] = [];
  for (const pair of halfReeds(run, plan, tick)) {
    out.push(rail(translate(pair, 0, y), 0.007, 3, 2));
    out.push(rail(reflectX(translate(pair, 0, y)), 0.007, 3, 2));
  }
  // The clasp is centred on the band and pulled just inside the frame bar, so
  // its 45° ends never poke past the extent.
  const height = 0.05 + 0.03 * density;
  const clasp = translate(trapezoidClasp(plan.claspHalf * 2, height), 0, n(y - height / 2));
  out.push(rail(clasp, 0.009, 2, 1));
  return out;
}

/** The top band and its y-mirror, plus the left/right bands. */
function allBands(
  runX: number,
  runY: number,
  planX: BandPlan,
  planY: BandPlan,
  hw: number,
  hh: number,
  inset: number,
  density: number
): readonly LatticeSpec[] {
  const topY = n(hh - inset * 0.55);
  const sideX = n(hw - inset * 0.55);
  const tick = 0.026 + 0.012 * density;

  const horizontal = edgeBand(runX, planX, topY, tick, density);
  const vertical = edgeBand(runY, planY, sideX, tick, density).map((spec) => ({
    ...spec,
    points: rotate90(spec.points),
  }));

  const specs: LatticeSpec[] = [...horizontal, ...vertical];
  for (const spec of [...horizontal, ...vertical]) {
    specs.push({ ...spec, points: reflectY(spec.points) });
    specs.push({ ...spec, points: reflectX(spec.points) });
  }
  return orbit(specs, D2);
}

/**
 * Margin between the frame bar and the aperture. Clamped so a caller-supplied
 * aperture that nearly fills the box still yields a drawable border.
 */
function borderReach(hw: number, hh: number, aperture?: { hw: number; hh: number }): number {
  if (!aperture) return MIN_APERTURE_MARGIN;
  return Math.max(1e-3, Math.min(MIN_APERTURE_MARGIN, hw - aperture.hw, hh - aperture.hh));
}

export function buildNineSlice(request: NineSliceRequest): NineSliceGeometry {
  const hw = Math.max(MIN_CORNER * 2, request.hw);
  const hh = Math.max(MIN_CORNER * 2, request.hh);
  const level = Math.min(4, Math.max(1, Math.round(request.level ?? DEFAULT_LEVEL)));
  const density = clamp01(request.density ?? DEFAULT_DENSITY);
  const ratio = Math.min(MAX_CORNER_RATIO, Math.max(0.05, request.cornerRatio ?? DEFAULT_CORNER_RATIO));
  /**
   * The aperture is what the border promises to keep clear. By default it is the
   * box inset by the corner block, which is exactly the nine-slice middle
   * region; a caller-supplied aperture shrinks the block so the promise holds.
   */
  const aperture = request.aperture
    ? { hw: n(request.aperture.hw), hh: n(request.aperture.hh) }
    : { hw: n(hw - Math.min(hw, hh) * ratio), hh: n(hh - Math.min(hw, hh) * ratio) };
  const corner = Math.max(
    MIN_CORNER,
    Math.min(Math.min(hw, hh) * ratio, hw - aperture.hw, hh - aperture.hh)
  );

  const inset = borderReach(hw, hh, request.aperture);
  const innerHw = n(hw - inset);
  const innerHh = n(hh - inset);
  const runX = Math.max(1e-3, n(hw - corner));
  const runY = Math.max(1e-3, n(hh - corner));
  const planX = planBand(runX, density);
  const planY = planBand(runY, density);

  const specs: LatticeSpec[] = [];

  // L1 — the outer frame bar.
  specs.push(box(n(hw), n(hh), 0.019 + 0.004 * density, 0, 0));

  // L2 — the inner hairline (drawn as the aperture boundary) and the corners.
  if (level >= 2) {
    specs.push(box(innerHw, innerHh, 0.006, 3, 2));
    specs.push(...corners(corner, n(hw), n(hh), density, level));
  }

  // L3 — the frieze bands and their centred clasps.
  if (level >= 3) {
    specs.push(...allBands(runX, runY, planX, planY, n(hw), n(hh), inset, density));
  }

  // L4 — a second rail nested between the bar and the aperture.
  if (level >= 4) {
    const nested = n(inset * 0.5);
    specs.push(box(n(hw - nested), n(hh - nested), 0.004, 3, 3));
  }

  return {
    specs,
    corner: n(corner),
    counts: { long: planX.reps, short: planY.reps },
    aperture,
    bounds: { hw: n(hw), hh: n(hh) },
  };
}
