/**
 * Poster-family motif emitters (Addendum 0004).
 *
 * Reconstructed from the one-sheet artwork as ruler-and-compass constructions:
 * equal angular division, concentric arcs at equal radial increments, constant
 * pitch reeding, and a squared falloff for the skyline silhouette.
 *
 * Every emitter specifies the right-hand element and calls `mirroredPair`, so
 * bilateral symmetry — the poster's most conspicuous property — holds by
 * construction rather than by matching coordinates twice.
 */
import type { BaseGenome } from './genome';
import { MIN_RAY_LENGTH, twoAdicValuation } from './fractals';
import type {
  FlutedPilasterMotif,
  RadialFanMotif,
  RingMotif,
  SkylineCombMotif,
  StrokeStyle,
} from './motifs';
import type { FrameSpec, Point2 } from './types';

const MIN_ARC_SEGMENTS = 6;
const MAX_ARC_SEGMENTS = 28;
const ARC_SAMPLE_RADIANS = 0.14;
const MIN_FLUTES = 2;
const MAX_FLUTES = 9;
const MIN_TEETH = 2;
const MAX_TEETH = 12;
const MIN_TOOTH_HEIGHT = 0.05;

const SEAM_EPSILON = 1e-9;

/** Trig at the poles returns ~1e-17, not 0; snapping makes mirrored seams exact. */
function snapZero(value: number): number {
  return Math.abs(value) < SEAM_EPSILON ? 0 : value;
}

function stroke(style: StrokeStyle): StrokeStyle {
  return { width: style.width, depth: style.depth, z: style.z, delay: style.delay };
}

/** Reflects a rail across x = 0, preserving point order so mirrored keys match. */
export function mirrorSpec(spec: FrameSpec): FrameSpec {
  return {
    ...spec,
    points: spec.points.map((point) => ({ x: snapZero(-point.x), y: point.y })),
    partDir: -(spec.partDir ?? 1),
  };
}

/** The right-hand rail plus its reflection. */
export function mirroredPair(spec: FrameSpec): FrameSpec[] {
  const right: FrameSpec = { ...spec, partDir: spec.partDir ?? 1 };
  return [right, mirrorSpec(right)];
}

function arcPoints(center: Point2, radius: number, from: number, to: number): Point2[] {
  const span = Math.abs(to - from);
  const segments = Math.min(
    MAX_ARC_SEGMENTS,
    Math.max(MIN_ARC_SEGMENTS, Math.round(span / ARC_SAMPLE_RADIANS))
  );
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / segments;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/* --------------------------------- radial fan --------------------------------- */

export interface ResolvedFanGrid {
  ribs: number;
  startAngle: number;
  endAngle: number;
  outerRadius: number;
}

/** ρ sets rib count, σ scales the sweep about its midpoint, λ scales the radius. */
export function resolveFanGrid(motif: RadialFanMotif, genome: BaseGenome): ResolvedFanGrid {
  const midAngle = (motif.startAngle + motif.endAngle) / 2;
  const halfSpan = Math.min(
    Math.PI * 0.62,
    Math.abs(motif.endAngle - motif.startAngle) * 0.5 * genome.raySpread
  );
  const direction = Math.sign(motif.endAngle - motif.startAngle) || 1;
  return {
    ribs: Math.max(3, Math.round(motif.ribs * genome.rayDensity)),
    startAngle: midAngle - direction * halfSpan,
    endAngle: midAngle + direction * halfSpan,
    outerRadius: motif.innerRadius + (motif.outerRadius - motif.innerRadius) * genome.rayReach,
  };
}

function fanRib(motif: RadialFanMotif, angle: number, outer: number, extra: Partial<FrameSpec>): FrameSpec {
  const center = { x: motif.centerX, y: motif.centerY };
  return {
    points: [
      { x: center.x + Math.cos(angle) * motif.innerRadius, y: center.y + Math.sin(angle) * motif.innerRadius },
      { x: center.x + Math.cos(angle) * outer, y: center.y + Math.sin(angle) * outer },
    ],
    ...stroke(motif),
    ...extra,
  };
}

function fanArcs(motif: RadialFanMotif, grid: ResolvedFanGrid): FrameSpec[] {
  const center = { x: motif.centerX, y: motif.centerY };
  const step = (grid.outerRadius - motif.innerRadius) / motif.arcs;
  return Array.from({ length: motif.arcs }, (_, index) => {
    const radius = motif.innerRadius + step * (index + 1);
    return {
      points: arcPoints(center, radius, grid.startAngle, grid.endAngle),
      ...stroke(motif),
      width: motif.width * (index === motif.arcs - 1 ? 1.25 : 0.7),
      delay: motif.delay + index * 0.025,
    };
  });
}

/** Ruler refinement: ribs at dyadic angles, reaching r^ℓ of the full rib. */
function fanRulerRibs(motif: RadialFanMotif, grid: ResolvedFanGrid, genome: BaseGenome): FrameSpec[] {
  const depth = genome.fractalDepth;
  if (depth <= 0) return [];

  const slots = (grid.ribs - 1) * 2 ** depth;
  const reach = grid.outerRadius - motif.innerRadius;
  const inserted: FrameSpec[] = [];
  for (let k = 1; k < slots; k += 1) {
    const level = depth - twoAdicValuation(k, depth);
    if (level === 0) continue;
    const length = reach * Math.pow(genome.fractalRatio, level);
    if (length < MIN_RAY_LENGTH) continue;
    const angle = grid.startAngle + ((grid.endAngle - grid.startAngle) * k) / slots;
    inserted.push(
      fanRib(motif, angle, motif.innerRadius + length, {
        width: motif.width * Math.pow(0.72, level),
        delay: motif.delay + 0.03 * level,
        role: 'fractal',
      })
    );
  }
  return inserted;
}

export function emitRadialFan(motif: RadialFanMotif, genome: BaseGenome): FrameSpec[] {
  const grid = resolveFanGrid(motif, genome);
  const ribs = Array.from({ length: grid.ribs }, (_, index) => {
    const angle = grid.startAngle + ((grid.endAngle - grid.startAngle) * index) / (grid.ribs - 1);
    return fanRib(motif, angle, grid.outerRadius, {});
  });
  return [...ribs, ...fanArcs(motif, grid), ...fanRulerRibs(motif, grid, genome)].flatMap(
    (spec) => mirroredPair(spec)
  );
}

/* ------------------------------ fluted pilaster ------------------------------ */

export function emitFlutedPilaster(motif: FlutedPilasterMotif, genome: BaseGenome): FrameSpec[] {
  const count = Math.min(MAX_FLUTES, Math.max(MIN_FLUTES, motif.count + genome.wingDelta));
  const flutes: FrameSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = motif.startX + index * motif.pitch;
    const inset = index * motif.taper;
    if (motif.top - inset <= motif.bottom + inset) break;
    flutes.push({
      points: [
        { x, y: motif.top - inset },
        { x, y: motif.bottom + inset },
      ],
      ...stroke(motif),
      width: motif.width * (index % 2 === 0 ? 1 : 0.55),
      z: motif.z - index * 0.06,
      delay: motif.delay + index * 0.02,
    });
  }
  return flutes.flatMap((spec) => mirroredPair(spec));
}

/* ------------------------------- skyline comb ------------------------------- */

interface ToothPlacement {
  x: number;
  height: number;
  order: number;
}

function toothPlacements(motif: SkylineCombMotif, teeth: number, sweep: number): ToothPlacement[] {
  const span = motif.maxHeight - motif.minHeight;
  return Array.from({ length: teeth }, (_, index) => {
    const falloff = teeth === 1 ? 0 : index / (teeth - 1);
    return {
      x: motif.startX + index * motif.pitch,
      height: (motif.minHeight + span * (1 - falloff) ** 2) * sweep,
      order: index,
    };
  });
}

function toothSpec(motif: SkylineCombMotif, placement: ToothPlacement, sign: number, extra: Partial<FrameSpec>): FrameSpec {
  return {
    points: [
      { x: placement.x, y: motif.baseY },
      { x: placement.x, y: motif.baseY + sign * placement.height },
    ],
    ...stroke(motif),
    delay: motif.delay + placement.order * 0.018,
    ...extra,
  };
}

/** Each tooth sprouts a half-height sub-tooth midway, recursively. */
function subTeeth(motif: SkylineCombMotif, placement: ToothPlacement, sign: number, genome: BaseGenome): FrameSpec[] {
  const produced: FrameSpec[] = [];
  let height = placement.height * genome.fractalRatio;
  let offset = motif.pitch * 0.5;
  for (let level = 1; level <= genome.fractalDepth; level += 1) {
    if (height < MIN_TOOTH_HEIGHT) break;
    produced.push(
      toothSpec(motif, { ...placement, x: placement.x + offset, height }, sign, {
        width: motif.width * Math.pow(0.74, level),
        delay: motif.delay + placement.order * 0.018 + level * 0.025,
        role: 'fractal',
      })
    );
    height *= genome.fractalRatio;
    offset += motif.pitch * Math.pow(0.5, level + 1);
  }
  return produced;
}

export function emitSkylineComb(motif: SkylineCombMotif, genome: BaseGenome): FrameSpec[] {
  const teeth = Math.min(MAX_TEETH, Math.max(MIN_TEETH, motif.teeth + genome.wingDelta));
  const sign = motif.direction === 'up' ? 1 : -1;
  const placements = toothPlacements(motif, teeth, genome.wingSweep);
  return placements
    .flatMap((placement) => [
      toothSpec(motif, placement, sign, {}),
      ...subTeeth(motif, placement, sign, genome),
    ])
    .flatMap((spec) => mirroredPair(spec));
}

/* ----------------------------------- ring ----------------------------------- */

/** Right half from top to bottom, plus its reflection: the two meet at both poles. */
export function emitRing(motif: RingMotif): FrameSpec[] {
  const center = { x: motif.centerX, y: motif.centerY };
  const segments = Math.max(MIN_ARC_SEGMENTS, Math.round(motif.segments / 2) * 2) / 2;
  const points = Array.from({ length: segments + 1 }, (_, index) => {
    const angle = Math.PI / 2 - (Math.PI * index) / segments;
    return {
      x: snapZero(center.x + Math.cos(angle) * motif.radius),
      y: snapZero(center.y + Math.sin(angle) * motif.radius),
    };
  });
  return mirroredPair({ points, ...stroke(motif) });
}
