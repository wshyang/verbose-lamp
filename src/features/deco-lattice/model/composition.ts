import { bundle } from './bundle';
import { clipSpecOutsideRect, rectFromHalfExtents, type ClippingRect } from './clip';
import type { LatticeSpec, Pt } from './lattice';
import {
  axisArrow, claspChevron, cornerDiamond, diagonalArm, nestedOctagram, reedRow,
  steppedBorder, trapezoidClasp,
} from './motifs';
import { D2, D4, orbit } from './symmetry';
import { traceWalks } from './walk';

export interface DecoLatticeRequest {
  mode: 'medallion' | 'frame';
  hw: number;
  hh: number;
  seed?: number;
  density?: number;
  /** 1..4 — how many tutorial layers to build; each level is a superset. */
  level?: number;
  /** Centred clear area (half extents) rails must not enter, e.g. for type. */
  aperture?: { hw: number; hh: number };
  /** Extra keep-out cartouches, in the same centred coordinates. */
  textSlots?: readonly ClippingRect[];
}

export interface DecoLatticeGeometry {
  specs: readonly LatticeSpec[];
  hw: number;
  hh: number;
}

/** Shared inputs of the four tutorial layers. */
interface LayerContext {
  req: DecoLatticeRequest;
  /** Shorter half extent: every proportion scales from it. */
  m: number;
  /** Heaviest stroke width. */
  heavy: number;
  density: number;
}

function rect(hw: number, hh: number): readonly Pt[] {
  return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
}

function shift(points: readonly Pt[], dx: number, dy: number): readonly Pt[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

function rotate90(points: readonly Pt[]): readonly Pt[] {
  return points.map((p) => ({ x: -p.y, y: p.x }));
}

function layer1({ req, m, heavy }: LayerContext): readonly LatticeSpec[] {
  const fx = req.hw - 0.25 * m;
  const fy = req.hh - 0.25 * m;
  const specs: LatticeSpec[] = [
    { points: steppedBorder({ hx: req.hw * 0.985, hy: req.hh * 0.985, steps: 2, d: 0.06 * m }), closed: true, width: heavy * 0.8, layer: 0, rank: 0 },
    { points: rect(fx, fy), closed: true, width: heavy * 1.6, layer: 0, rank: 0 },
    { points: rect(req.hw - 0.28 * m, req.hh - 0.28 * m), closed: true, width: heavy * 0.45, layer: 0, rank: 1 },
    { points: rect(req.hw - 0.31 * m, req.hh - 0.31 * m), closed: true, width: heavy * 0.45, layer: 0, rank: 1 },
  ];
  const span = Math.min(0.9 * m, req.hw * 0.9);
  const clasp = trapezoidClasp(span, 0.12 * m);
  // Height = span/2 keeps the chevron's arms at exactly 45°.
  const chevron = claspChevron(0.1 * m, 0.05 * m);
  for (const [pts, closed] of [[clasp, true], [chevron, false]] as const) {
    specs.push({ points: shift(pts, 0, -fy), closed, width: heavy * 0.7, layer: 0, rank: 1 });
    specs.push({ points: shift(rotate90(pts), -fx, 0), closed, width: heavy * 0.7, layer: 0, rank: 1 });
  }
  return specs;
}

function layer2({ req, m, heavy }: LayerContext): readonly LatticeSpec[] {
  if (req.mode === 'frame') return [];
  const rings = nestedOctagram(0.396 * m, 3, 0.8);
  return rings.map((points, i) => ({
    points, closed: true, width: heavy * (i === 0 ? 0.8 : 0.35), layer: 1 as const,
    rank: (i === 0 ? 1 : 2) as 1 | 2,
  }));
}

function layer3({ req, m, heavy, density }: LayerContext): readonly LatticeSpec[] {
  const specs: LatticeSpec[] = [];
  const seed = req.seed ?? 1925;
  if (req.mode === 'medallion') {
    const walks = traceWalks({
      seed, cell: heavy / 2, inner: 0.58 * m, outer: 0.9 * m,
      count: Math.round(3 + density * 8), minRun: 2,
    });
    for (const walk of walks) {
      specs.push(...bundle(walk, {
        strands: 2 + Math.round(density * 2), spacing: heavy * 0.55,
        width: heavy * 0.22, layer: 2, rank: 2,
      }));
    }
    specs.push({ points: diagonalArm(0.38 * m, 0.045 * m), closed: true, width: heavy * 0.5, layer: 2, rank: 2 });
    specs.push({ points: axisArrow(0.46 * m, 0.12 * m), width: heavy * 0.5, layer: 2, rank: 2 });
  } else {
    const bracket: readonly Pt[] = [
      { x: req.hw - 0.55 * m, y: req.hh - 0.36 * m },
      { x: req.hw - 0.48 * m, y: req.hh - 0.36 * m },
      { x: req.hw - 0.36 * m, y: req.hh - 0.48 * m },
      { x: req.hw - 0.36 * m, y: req.hh - 0.55 * m },
    ];
    specs.push(...bundle(bracket, { strands: 3, spacing: heavy * 0.6, width: heavy * 0.25, layer: 2, rank: 2 }));
  }
  return specs;
}

function layer4({ req, m, heavy }: LayerContext): readonly LatticeSpec[] {
  const at = { x: req.hw - 0.34 * m, y: req.hh - 0.34 * m };
  const specs: LatticeSpec[] = [
    { points: cornerDiamond(at, 0.085 * m), closed: true, width: heavy * 0.35, layer: 3, rank: 2 },
    { points: cornerDiamond(at, 0.045 * m), closed: true, width: heavy * 0.25, layer: 3, rank: 3 },
  ];
  const y = req.hh - 0.355 * m;
  const x = req.hw - 0.355 * m;
  const spanX = req.hw - 0.52 * m;
  const spanY = req.hh - 0.52 * m;
  const opts = { tickLen: 0.07 * m, barW: 0.012 * m, gap: 0.03 * m };
  for (const tick of reedRow({ ...opts, from: { x: -spanX, y }, to: { x: spanX, y } })) {
    specs.push({ points: tick, width: heavy * 0.3, layer: 3, rank: 3 });
  }
  for (const tick of reedRow({ ...opts, from: { x, y: -spanY }, to: { x, y: spanY } })) {
    specs.push({ points: tick, width: heavy * 0.3, layer: 3, rank: 3 });
  }
  return specs;
}

/** The four-layer tutorial recipe, generated from rules and a seed. */
export function buildDecoLattice(req: DecoLatticeRequest): DecoLatticeGeometry {
  const m = Math.min(req.hw, req.hh);
  const heavy = 0.03 * m;
  const density = Math.min(1, Math.max(0, req.density ?? 0.7));
  const level = Math.min(4, Math.max(1, req.level ?? 4));
  const group = Math.abs(req.hw - req.hh) < 1e-9 ? D4 : D2;
  const context: LayerContext = { req, m, heavy, density };
  const layers = [layer1(context), layer2(context), layer3(context), layer4(context)];
  const orbited = layers.slice(0, level).flatMap((layer, i) => orbit(layer, i === 0 || i === 3 ? dedupeGroup(group) : group));
  return { specs: clearKeepOuts(orbited, req), hw: req.hw, hh: req.hh };
}

/** Closed centred motifs already span the frame; orbit only fills quadrants. */
function dedupeGroup(group: readonly (readonly [number, number, number, number])[]) {
  return group;
}
/** Clips every rail around the aperture and text slots, when given. */
function clearKeepOuts(
  specs: readonly LatticeSpec[],
  req: DecoLatticeRequest,
): readonly LatticeSpec[] {
  const keepOuts: ClippingRect[] = [
    ...(req.aperture ? [rectFromHalfExtents(req.aperture.hw, req.aperture.hh)] : []),
    ...(req.textSlots ?? []),
  ];
  return keepOuts.reduce<readonly LatticeSpec[]>(
    (current, rect) => current.flatMap((spec) => clipSpecOutsideRect(spec, rect)),
    specs,
  );
}
