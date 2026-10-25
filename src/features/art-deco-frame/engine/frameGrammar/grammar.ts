import { Intricacy, Point2, PolylineSpec, RailKind } from './types';

/* -------------------------------------------------------------------------- */
/*  DENSITY FUNCTIONS (ADDENDUM-002 §2.1)                                      */
/* -------------------------------------------------------------------------- */

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

/** Elaboration generations for k > 0.5: 0,1,2,3,4. Identity (0) at baseline. */
export function elaborationGenerations(k: Intricacy): number {
  const kk = clamp01(k);
  if (kk <= 0.5) return 0;
  return Math.min(4, Math.floor((kk - 0.5) * 8 + 1e-9));
}

/** Rank budget for k < 0.5: 0,1,2,3. Unlimited (3 = everything) at baseline. */
export function rankBudget(k: Intricacy): number {
  const kk = clamp01(k);
  if (kk >= 0.5) return 3;
  return Math.min(3, Math.floor(kk * 8 + 1e-9));
}

/* -------------------------------------------------------------------------- */
/*  RANK DERIVATION (ADDENDUM-002 §2.2)                                        */
/* -------------------------------------------------------------------------- */

const BASE_RANK: Record<RailKind, number> = {
  frame: 0,
  monogram: 0,
  rule: 1,
  diamond: 2,
  column: 2,
  chevron: 2,
  ray: 3,
  arch: 3,
  pinstripe: 3,
  star: 1,
  lattice: 2,
  reed: 3,
};

/**
 * Derives `rank` from kind and ordinal. Frames: the first frame of a card is rank 0,
 * all later frames rank 1. Everything else uses its base rank. Returns new objects.
 */
export function annotateRanks(specs: PolylineSpec[]): PolylineSpec[] {
  // Frames are emitted as left/right half pairs; both halves of the first pair are
  // the primary frame (rank 0). Count pairs, not halves.
  let frameHalvesSeen = 0;
  return specs.map((spec) => {
    const kind = spec.kind ?? 'frame';
    if (kind !== 'frame') return { ...spec, rank: BASE_RANK[kind] };
    const pairOrdinal = Math.floor(frameHalvesSeen / 2);
    frameHalvesSeen += 1;
    return { ...spec, rank: BASE_RANK.frame + Math.min(1, pairOrdinal) };
  });
}

/* -------------------------------------------------------------------------- */
/*  REDUCE                                                                      */
/* -------------------------------------------------------------------------- */

export function reduceByRank(specs: PolylineSpec[], k: Intricacy): PolylineSpec[] {
  const budget = rankBudget(k);
  return specs.filter((s) => (s.rank ?? 0) <= budget);
}

/* -------------------------------------------------------------------------- */
/*  GEOMETRY HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function centroidOf(points: Point2[]): Point2 {
  const n = points.length || 1;
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

function unitNormal(a: Point2, b: Point2): Point2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function miterAt(prev: Point2 | null, curr: Point2, next: Point2 | null): Point2 {
  if (!prev && next) return unitNormal(curr, next);
  if (!next && prev) return unitNormal(prev, curr);
  if (!prev || !next) return { x: 0, y: 1 };
  const n1 = unitNormal(prev, curr);
  const n2 = unitNormal(curr, next);
  const mx = n1.x + n2.x;
  const my = n1.y + n2.y;
  const ml = Math.hypot(mx, my);
  if (ml < 1e-3) return n1;
  const dot = Math.max(0.38, (mx / ml) * n1.x + (my / ml) * n1.y);
  const scale = Math.min(2.3, 1 / dot);
  return { x: (mx / ml) * scale, y: (my / ml) * scale };
}

/**
 * Offsets a polyline outward (away from the frame origin) by distance d using miter
 * normals. Outward is resolved by a sign test against the origin so left/right halves
 * keep meeting on the x = 0 seam.
 */
export function offsetPolylineOutward(points: Point2[], d: number, closed: boolean): Point2[] {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ ...p }));
  const sampleNormal = (i: number) => {
    const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : null;
    const next = i < n - 1 ? points[i + 1] : closed ? points[0] : null;
    return miterAt(prev, points[i], next);
  };
  // Outward = away from the card origin (0,0), where every frame is centred. Using the
  // origin rather than the polyline centroid keeps left/right halves consistent.
  const probe = sampleNormal(Math.floor(n / 2));
  const mid = points[Math.floor(n / 2)];
  const outwardSign = probe.x * mid.x + probe.y * mid.y >= 0 ? 1 : -1;
  return points.map((p, i) => {
    const m = sampleNormal(i);
    return { x: p.x + m.x * d * outwardSign, y: p.y + m.y * d * outwardSign };
  });
}

function scaleAbout(points: Point2[], origin: Point2, s: number): Point2[] {
  return points.map((p) => ({
    x: origin.x + (p.x - origin.x) * s,
    y: origin.y + (p.y - origin.y) * s,
  }));
}

/* -------------------------------------------------------------------------- */
/*  PRODUCTION RULES (ADDENDUM-002 §2.3) — pure functions of (spec, generation) */
/* -------------------------------------------------------------------------- */

type Production = (spec: PolylineSpec, i: number) => PolylineSpec | null;

const GENERATION_CAP: Record<RailKind, number> = {
  frame: 4,
  diamond: 3,
  rule: 2,
  column: 2,
  chevron: 2,
  ray: 1,
  arch: 0,
  monogram: 0,
  pinstripe: 0,
  star: 2,
  lattice: 1,
  reed: 0,
};

const echoRing: Production = (spec, i) => ({
  ...spec,
  points: offsetPolylineOutward(spec.points, 0.11 * Math.pow(1.4, i), Boolean(spec.closed)),
  width: spec.width * (i % 2 === 1 ? 0.38 : 0.6),
  z: spec.z - 0.5 - 0.22 * i,
  delay: spec.delay + 0.05 * i,
});

const nestedDiamond: Production = (spec, i) => ({
  ...spec,
  points: scaleAbout(spec.points, centroidOf(spec.points), Math.pow(0.58, i)),
  width: spec.width * 0.8,
  delay: spec.delay + 0.04 * i,
});

const guillocheTwin: Production = (spec, i) => {
  if (spec.points.length !== 2) return null;
  const [a, b] = spec.points;
  const n = unitNormal(a, b);
  const sign = i % 2 === 1 ? 1 : -1;
  const d = 0.07 * Math.ceil(i / 2) * sign;
  return {
    ...spec,
    points: [
      { x: a.x + n.x * d, y: a.y + n.y * d },
      { x: b.x + n.x * d, y: b.y + n.y * d },
    ],
    width: spec.width * 0.45,
    delay: spec.delay + 0.03 * i,
  };
};

const shadowColumn: Production = (spec, i) => {
  const sign = spec.partDir ?? 1;
  return {
    ...spec,
    points: spec.points.map((p) => ({ x: p.x + sign * 0.07 * i, y: p.y })),
    z: spec.z - 0.1 * i,
    width: spec.width * 0.6,
    delay: spec.delay + 0.04 * i,
  };
};

const nestedChevron: Production = (spec, i) => {
  if (spec.points.length !== 3) return null;
  const apex = spec.points[1];
  return {
    ...spec,
    points: scaleAbout(spec.points, apex, Math.pow(0.72, i)),
    width: spec.width * 0.7,
    delay: spec.delay + 0.04 * i,
  };
};

const dashDotTip: Production = (spec) => {
  if (spec.points.length !== 2) return null;
  const [a, b] = spec.points;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    ...spec,
    points: [
      { x: a.x + dx * 1.08, y: a.y + dy * 1.08 },
      { x: a.x + dx * 1.22, y: a.y + dy * 1.22 },
    ],
    width: spec.width * 0.7,
    delay: spec.delay + 0.06,
  };
};

/** Star elaboration echoes inward, like nestedOctagram (ADDENDUM-021 §3.2). */
const starEcho: Production = (spec, i) => ({
  ...spec,
  points: scaleAbout(spec.points, centroidOf(spec.points), Math.pow(0.8, i)),
  width: spec.width * 0.65,
  delay: spec.delay + 0.04 * i,
});

/** Lattice elaboration adds one parallel strand per generation. */
const latticeStrand: Production = (spec, i) => ({
  ...spec,
  points: offsetPolylineOutward(spec.points, 0.07 * i, Boolean(spec.closed)),
  width: spec.width * 0.6,
  delay: spec.delay + 0.03 * i,
});

const PRODUCTIONS: Partial<Record<RailKind, Production>> = {
  frame: echoRing,
  diamond: nestedDiamond,
  rule: guillocheTwin,
  column: shadowColumn,
  chevron: nestedChevron,
  ray: dashDotTip,
  star: starEcho,
  lattice: latticeStrand,
  // reed intentionally has no production: density already controls it.
};

/* -------------------------------------------------------------------------- */
/*  ELABORATE + APPLY                                                           */
/* -------------------------------------------------------------------------- */

function produceFor(spec: PolylineSpec, generations: number): PolylineSpec[] {
  const kind = spec.kind ?? 'frame';
  const rule = PRODUCTIONS[kind];
  if (!rule) return [];
  const count = Math.min(generations, GENERATION_CAP[kind]);
  const out: PolylineSpec[] = [];
  for (let i = 1; i <= count; i++) {
    const produced = rule(spec, i);
    if (produced) out.push(produced);
  }
  return out;
}

export function elaborate(specs: PolylineSpec[], k: Intricacy): PolylineSpec[] {
  const generations = elaborationGenerations(k);
  if (generations === 0) return specs;
  return specs.flatMap((spec) => [spec, ...produceFor(spec, generations)]);
}

/** core → annotate → reduce → elaborate. Identity at k = 0.5. */
export function applyIntricacy(coreSpecs: PolylineSpec[], k: Intricacy): PolylineSpec[] {
  const annotated = annotateRanks(coreSpecs);
  return elaborate(reduceByRank(annotated, k), k);
}
