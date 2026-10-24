/**
 * Parametric Art Deco motif families (Addendum 0003).
 *
 * Each emitter generalises one baseline primitive. At signature genes the
 * arithmetic is operation-for-operation identical to the baseline, so the
 * original rails are one member of each family (enforced by the fixture).
 * Pure: inputs are never mutated; arrays are returned.
 */
import type { BaseGenome } from './genome';
import type {
  ChevronWingsMotif,
  CutOctagonMotif,
  DiamondMotif,
  SplitRuleMotif,
  StrokeStyle,
  SunburstMotif,
  ZigguratMotif,
} from './motifs';
import type { FrameSpec, Point2 } from './types';

const CORNER_SAMPLES = 6;
const RAY_TAPER = 0.34;
const MAX_FAN_SPREAD = Math.PI * 0.95;
const ARCH_SEGMENTS = 12;
const MAX_WINGS = 6;

function stroke(style: StrokeStyle): StrokeStyle {
  return { width: style.width, depth: style.depth, z: style.z, delay: style.delay };
}

/* ------------------------------- cut octagon ------------------------------- */

interface CornerCurve {
  start: Point2;
  end: Point2;
  outer: Point2;
  inner: Point2;
  profile: number;
}

/** Interior samples of B(t) = (1−t)²P0 + 2t(1−t)C + t²P2; none for a straight chamfer. */
export function cornerInterior(curve: CornerCurve): Point2[] {
  if (curve.profile === 0) return [];
  const target = curve.profile > 0 ? curve.outer : curve.inner;
  const weight = Math.abs(curve.profile);
  const midX = (curve.start.x + curve.end.x) / 2;
  const midY = (curve.start.y + curve.end.y) / 2;
  const control = { x: midX + weight * (target.x - midX), y: midY + weight * (target.y - midY) };
  const samples: Point2[] = [];
  for (let k = 1; k < CORNER_SAMPLES; k += 1) {
    const t = k / CORNER_SAMPLES;
    const a = (1 - t) * (1 - t);
    const b = 2 * t * (1 - t);
    const c = t * t;
    samples.push({
      x: a * curve.start.x + b * control.x + c * curve.end.x,
      y: a * curve.start.y + b * control.y + c * curve.end.y,
    });
  }
  return samples;
}

interface OctagonFrame {
  hw: number;
  hh: number;
  c: number;
  profile: number;
}

function scaleX(points: Point2[], sign: number): Point2[] {
  return points.map((point) => ({ x: sign * point.x, y: point.y }));
}

function octagonHalf(frame: OctagonFrame, sign: 1 | -1): Point2[] {
  const { hw, hh, c, profile } = frame;
  const topCorner = cornerInterior({
    start: { x: hw - c, y: hh },
    end: { x: hw, y: hh - c },
    outer: { x: hw, y: hh },
    inner: { x: hw - c, y: hh - c },
    profile,
  });
  const bottomCorner = cornerInterior({
    start: { x: hw, y: -hh + c },
    end: { x: hw - c, y: -hh },
    outer: { x: hw, y: -hh },
    inner: { x: hw - c, y: -hh + c },
    profile,
  });
  return [
    { x: 0, y: hh },
    { x: sign * (hw - c), y: hh },
    ...scaleX(topCorner, sign),
    { x: sign * hw, y: hh - c },
    { x: sign * hw, y: -hh + c },
    ...scaleX(bottomCorner, sign),
    { x: sign * (hw - c), y: -hh },
    { x: 0, y: -hh },
  ];
}

/** κ scales the chamfer; p bends it into a rounded (p > 0) or notched (p < 0) corner. */
export function emitCutOctagon(motif: CutOctagonMotif, genome: BaseGenome): FrameSpec[] {
  const hw = motif.halfWidth;
  const hh = motif.halfHeight;
  const c = Math.min(motif.cut * genome.cornerScale, hw * 0.45, hh * 0.45);
  const frame = { hw, hh, c, profile: genome.cornerProfile };
  return [
    { points: octagonHalf(frame, 1), ...stroke(motif), partDir: 1 },
    { points: octagonHalf(frame, -1), ...stroke(motif), partDir: -1 },
  ];
}

/* --------------------------------- ziggurat --------------------------------- */

interface StaircaseFrame {
  hw: number;
  hh: number;
  s: number;
  steps: number;
}

function staircaseHalf(frame: StaircaseFrame, signX: 1 | -1): Point2[] {
  const { hw, hh, s, steps } = frame;
  const points: Point2[] = [{ x: 0, y: hh }];
  for (let k = steps; k >= 1; k -= 1) {
    points.push({ x: signX * (hw - k * s), y: hh - (steps - k) * s });
    points.push({ x: signX * (hw - k * s), y: hh - (steps - k + 1) * s });
  }
  points.push({ x: signX * hw, y: hh - steps * s });
  points.push({ x: signX * hw, y: -hh + steps * s });
  for (let k = 1; k <= steps; k += 1) {
    points.push({ x: signX * (hw - k * s), y: -hh + (steps - k + 1) * s });
    points.push({ x: signX * (hw - k * s), y: -hh + (steps - k) * s });
  }
  points.push({ x: 0, y: -hh });
  return points;
}

/** n stairs per corner with total inset 2κs, so the plate never encroaches on the title. */
export function emitZiggurat(motif: ZigguratMotif, genome: BaseGenome): FrameSpec[] {
  const steps = genome.zigguratSteps;
  const frame = {
    hw: motif.halfWidth,
    hh: motif.halfHeight,
    s: (motif.step * genome.cornerScale * 2) / steps,
    steps,
  };
  return ([-1, 1] as const).map((signX) => ({
    points: staircaseHalf(frame, signX),
    ...stroke(motif),
    partDir: signX,
  }));
}

/* --------------------------------- diamond --------------------------------- */

export function emitDiamond(motif: Omit<DiamondMotif, 'kind'>): FrameSpec {
  const cx = motif.centerX;
  const cy = motif.centerY;
  const rx = motif.radiusX;
  const ry = motif.radiusY;
  return {
    points: [
      { x: cx, y: cy + ry },
      { x: cx + rx, y: cy },
      { x: cx, y: cy - ry },
      { x: cx - rx, y: cy },
    ],
    closed: true,
    ...stroke(motif),
    partDir: motif.partDir ?? (cx < 0 ? -1 : 1),
  };
}

/* --------------------------------- sunburst --------------------------------- */

export interface ResolvedFan {
  rays: number;
  spread: number;
  outerRadius: number;
  baseAngle: number;
}

/** N' = 1 + 2·round(ρ(N−1)/2) keeps the axial ray; σ and λ scale angle and reach. */
export function resolveFan(motif: SunburstMotif, genome: BaseGenome): ResolvedFan {
  const rays = 1 + 2 * Math.round(((motif.rays - 1) / 2) * genome.rayDensity);
  return {
    rays: Math.max(3, rays),
    spread: Math.min(motif.spread * genome.raySpread, MAX_FAN_SPREAD),
    outerRadius: motif.outerRadius * genome.rayReach,
    baseAngle: motif.direction === 'up' ? Math.PI * 0.5 : -Math.PI * 0.5,
  };
}

export interface FanRayShape {
  offsetFromCenter: number;
  angle: number;
  fullLength: number;
}

export function fanRayShape(fan: ResolvedFan, fraction: number): FanRayShape {
  const offsetFromCenter = Math.abs(fraction - 0.5) * 2;
  return {
    offsetFromCenter,
    angle: fan.baseAngle + (fraction - 0.5) * fan.spread,
    fullLength: fan.outerRadius * (1.0 - offsetFromCenter * RAY_TAPER),
  };
}

function baseRay(motif: SunburstMotif, fan: ResolvedFan, index: number): FrameSpec {
  const shape = fanRayShape(fan, index / (fan.rays - 1));
  const x2 = motif.centerX + Math.cos(shape.angle) * shape.fullLength;
  return {
    points: [
      { x: motif.centerX + Math.cos(shape.angle) * motif.innerRadius, y: motif.centerY + Math.sin(shape.angle) * motif.innerRadius },
      { x: x2, y: motif.centerY + Math.sin(shape.angle) * shape.fullLength },
    ],
    width: shape.offsetFromCenter < 0.12 ? motif.width * 1.35 : motif.width,
    depth: motif.depth,
    z: motif.z,
    delay: motif.delay + shape.offsetFromCenter * 0.16,
    partDir: x2 < -0.01 ? -1 : 1,
  };
}

function fanArches(motif: SunburstMotif, fan: ResolvedFan): FrameSpec[] {
  const right: Point2[] = [];
  const left: Point2[] = [];
  for (let s = 0; s <= ARCH_SEGMENTS; s++) {
    const aR = fan.baseAngle - (s / ARCH_SEGMENTS) * (fan.spread * 0.52);
    const aL = fan.baseAngle + (s / ARCH_SEGMENTS) * (fan.spread * 0.52);
    right.push({ x: motif.centerX + Math.cos(aR) * motif.innerRadius, y: motif.centerY + Math.sin(aR) * motif.innerRadius });
    left.push({ x: motif.centerX + Math.cos(aL) * motif.innerRadius, y: motif.centerY + Math.sin(aL) * motif.innerRadius });
  }
  const archStyle = { width: motif.width * 1.15, depth: motif.depth, z: motif.z, delay: motif.delay };
  return [
    { points: right, ...archStyle, partDir: 1 },
    { points: left, ...archStyle, partDir: -1 },
  ];
}

export function emitSunburst(motif: SunburstMotif, fan: ResolvedFan): FrameSpec[] {
  const rays = Array.from({ length: fan.rays }, (_, index) => baseRay(motif, fan, index));
  return [...rays, ...fanArches(motif, fan)];
}

/* -------------------------------- split rule -------------------------------- */

export function emitSplitRule(motif: SplitRuleMotif): FrameSpec[] {
  const { y, innerX, outerX } = motif;
  return [
    { points: [{ x: innerX, y }, { x: outerX, y }], ...stroke(motif), partDir: 1 },
    { points: [{ x: -innerX, y }, { x: -outerX, y }], ...stroke(motif), partDir: -1 },
  ];
}

/* ------------------------------- chevron wings ------------------------------- */

export function emitChevronWings(motif: ChevronWingsMotif, genome: BaseGenome): FrameSpec[] {
  const count = Math.min(MAX_WINGS, Math.max(1, motif.count + genome.wingDelta));
  const wingWidth = motif.wingWidth * genome.wingSweep;
  const wings: FrameSpec[] = [];
  for (let i = 0; i < count; i++) {
    const xBase = motif.startX + i * motif.spacing;
    const h = motif.wingHeight * (1 - i * 0.14);
    for (const signX of [-1, 1] as const) {
      wings.push({
        points: [
          { x: signX * xBase, y: h },
          { x: signX * (xBase + wingWidth), y: 0 },
          { x: signX * xBase, y: -h },
        ],
        width: motif.width,
        depth: motif.depth,
        z: motif.z,
        delay: motif.delay + i * 0.06,
        partDir: signX,
      });
    }
  }
  return wings;
}
