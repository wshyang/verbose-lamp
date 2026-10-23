/**
 * Recursive (fractal) motif rules (Addendum 0003). All are inert at depth 0.
 *
 *  - H-tree diamonds: children tip-to-tip on alternating axes, radii × r per level.
 *  - Ruler sunbursts: rays inserted at dyadic angles; level ℓ = d − v₂(k), length × r^ℓ.
 *  - Cantor rules:    [a, b] → [a, a + r|I|] ∪ [b − r|I|, b], applied d times.
 *
 * Every rule stops at a minimum feature size, like rendering a fractal to a finite
 * resolution, which bounds the rail count.
 */
import type { BaseGenome } from './genome';
import type { DiamondMotif, SplitRuleMotif, SunburstMotif } from './motifs';
import { emitDiamond, fanRayShape, type ResolvedFan } from './primitives';
import type { FrameSpec } from './types';

export const MIN_DIAMOND_RADIUS = 0.03;
export const MIN_RAY_LENGTH = 0.06;
export const MIN_CANTOR_SEGMENT = 0.05;

/* ---------------------------------- H-tree ---------------------------------- */

interface DiamondNode {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

type Axis = 'x' | 'y';

interface TreeContext {
  motif: DiamondMotif;
  depth: number;
  ratio: number;
}

export function childDiamonds(node: DiamondNode, axis: Axis, ratio: number): DiamondNode[] {
  const rx = node.rx * ratio;
  const ry = node.ry * ratio;
  if (axis === 'x') {
    const offset = node.rx + rx;
    return [
      { cx: node.cx - offset, cy: node.cy, rx, ry },
      { cx: node.cx + offset, cy: node.cy, rx, ry },
    ];
  }
  const offset = node.ry + ry;
  return [
    { cx: node.cx, cy: node.cy - offset, rx, ry },
    { cx: node.cx, cy: node.cy + offset, rx, ry },
  ];
}

function partDirection(centerX: number, fallback: number | undefined): number {
  if (centerX < -1e-9) return -1;
  if (centerX > 1e-9) return 1;
  return fallback ?? 1;
}

function treeDiamond(node: DiamondNode, level: number, context: TreeContext): FrameSpec {
  const { motif } = context;
  return {
    ...emitDiamond({
      centerX: node.cx,
      centerY: node.cy,
      radiusX: node.rx,
      radiusY: node.ry,
      width: motif.width * Math.pow(0.78, level),
      depth: motif.depth * Math.pow(0.85, level),
      z: motif.z,
      delay: motif.delay + 0.035 * level,
      partDir: partDirection(node.cx, motif.partDir),
    }),
    role: 'fractal',
  };
}

function growTree(node: DiamondNode, axis: Axis, level: number, context: TreeContext): FrameSpec[] {
  if (level > context.depth) return [];
  const nextAxis: Axis = axis === 'x' ? 'y' : 'x';
  return childDiamonds(node, axis, context.ratio)
    .filter((child) => Math.max(child.rx, child.ry) >= MIN_DIAMOND_RADIUS)
    .flatMap((child) => [treeDiamond(child, level, context), ...growTree(child, nextAxis, level + 1, context)]);
}

export function sproutDiamondTree(motif: DiamondMotif, genome: BaseGenome): FrameSpec[] {
  if (genome.fractalDepth <= 0) return [];
  const root = { cx: motif.centerX, cy: motif.centerY, rx: motif.radiusX, ry: motif.radiusY };
  const majorAxis: Axis = motif.radiusX >= motif.radiusY ? 'x' : 'y';
  return growTree(root, majorAxis, 1, { motif, depth: genome.fractalDepth, ratio: genome.fractalRatio });
}

/* ------------------------------ ruler sunburst ------------------------------ */

/** 2-adic valuation of k, capped at `cap` (k > 0). */
export function twoAdicValuation(k: number, cap: number): number {
  let valuation = 0;
  let remainder = k;
  while (valuation < cap && remainder % 2 === 0) {
    remainder /= 2;
    valuation += 1;
  }
  return valuation;
}

function rulerRay(motif: SunburstMotif, fan: ResolvedFan, slot: { fraction: number; level: number; ratio: number }): FrameSpec | null {
  const shape = fanRayShape(fan, slot.fraction);
  const reach = (shape.fullLength - motif.innerRadius) * Math.pow(slot.ratio, slot.level);
  if (reach < MIN_RAY_LENGTH) return null;

  const outer = motif.innerRadius + reach;
  const x2 = motif.centerX + Math.cos(shape.angle) * outer;
  return {
    points: [
      { x: motif.centerX + Math.cos(shape.angle) * motif.innerRadius, y: motif.centerY + Math.sin(shape.angle) * motif.innerRadius },
      { x: x2, y: motif.centerY + Math.sin(shape.angle) * outer },
    ],
    width: motif.width * Math.pow(0.72, slot.level),
    depth: motif.depth,
    z: motif.z,
    delay: motif.delay + shape.offsetFromCenter * 0.16 + 0.03 * slot.level,
    partDir: x2 < -0.01 ? -1 : 1,
    role: 'fractal',
  };
}

export function refineSunburst(motif: SunburstMotif, fan: ResolvedFan, genome: BaseGenome): FrameSpec[] {
  const depth = genome.fractalDepth;
  if (depth <= 0) return [];
  const slots = (fan.rays - 1) * 2 ** depth;
  const inserted: FrameSpec[] = [];
  for (let k = 1; k < slots; k += 1) {
    const level = depth - twoAdicValuation(k, depth);
    if (level === 0) continue;
    const ray = rulerRay(motif, fan, { fraction: k / slots, level, ratio: genome.fractalRatio });
    if (ray) inserted.push(ray);
  }
  return inserted;
}

/* -------------------------------- Cantor rule -------------------------------- */

export function cantorIntervals(start: number, end: number, depth: number, ratio: number): Array<[number, number]> {
  const kept = (end - start) * ratio;
  if (depth <= 0 || Math.abs(kept) < MIN_CANTOR_SEGMENT) return [[start, end]];
  return [
    ...cantorIntervals(start, start + kept, depth - 1, ratio),
    ...cantorIntervals(end - kept, end, depth - 1, ratio),
  ];
}

function cantorSegment(motif: SplitRuleMotif, interval: [number, number], side: 1 | -1): FrameSpec {
  const [a, b] = interval;
  const span = motif.outerX - motif.innerX;
  const progress = span === 0 ? 0 : (a - motif.innerX) / span;
  return {
    points: [
      { x: side * a, y: motif.y },
      { x: side * b, y: motif.y },
    ],
    width: motif.width,
    depth: motif.depth,
    z: motif.z,
    delay: motif.delay + progress * 0.12,
    partDir: side,
    role: 'fractal',
  };
}

/** Returns null when the rule stays solid (depth 0 or too short to split). */
export function cantorRule(motif: SplitRuleMotif, genome: BaseGenome): FrameSpec[] | null {
  const intervals = cantorIntervals(motif.innerX, motif.outerX, genome.fractalDepth, genome.fractalRatio);
  if (intervals.length <= 1) return null;
  return [
    ...intervals.map((interval) => cantorSegment(motif, interval, 1)),
    ...intervals.map((interval) => cantorSegment(motif, interval, -1)),
  ];
}
