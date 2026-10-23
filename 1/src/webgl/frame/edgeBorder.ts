/**
 * Screen border (Addendum 0005): the poster's printed edge border, rebuilt as a
 * persistent proscenium hugging the viewport edge.
 *
 * Geometry is authored in unit viewport space — y in [-1, 1], x in [-aspect, aspect]
 * — so it belongs to the camera, never to a title card. Pure and deterministic.
 */
import { MIN_RAY_LENGTH, twoAdicValuation } from './fractals';
import { clampGenome, type BaseGenome } from './genome';
import type { FrameSpec, Point2 } from './types';

export interface EdgeBorderRequest {
  /** width / height of the viewport */
  aspect: number;
  genome?: BaseGenome;
  /** 0..1 — how many nested rules and how dense the reeding */
  density: number;
}

export interface EdgeBorderGeometry {
  specs: FrameSpec[];
  /** unit-space extents, for asserting the border stays inside the viewport */
  extentX: number;
  extentY: number;
}

const SEAM_EPSILON = 1e-9;
const ARC_SAMPLE_RADIANS = 0.12;
const MAX_NESTED_RULES = 4;
const MIN_REED_PER_RUN = 3;
const MAX_REED_PER_RUN = 26;
const CORNER_FAN_REACH = 0.42;
const REED_INSET = 0.095;
const MIN_TICK_LENGTH = 0.008;
const CORNER_FAN_ARCS = 3;

function snap(value: number): number {
  return Math.abs(value) < SEAM_EPSILON ? 0 : value;
}

function reflectX(specs: FrameSpec[]): FrameSpec[] {
  return specs.map((spec) => ({
    ...spec,
    points: spec.points.map((point) => ({ x: snap(-point.x), y: point.y })),
    partDir: -(spec.partDir ?? 1),
  }));
}

function reflectY(specs: FrameSpec[]): FrameSpec[] {
  return specs.map((spec) => ({
    ...spec,
    points: spec.points.map((point) => ({ x: point.x, y: snap(-point.y) })),
  }));
}

function stroke(width: number, depth: number, z: number, delay: number) {
  return { width, depth, z, delay };
}

function arcPoints(center: Point2, radius: number, from: number, to: number): Point2[] {
  const segments = Math.max(4, Math.round(Math.abs(to - from) / ARC_SAMPLE_RADIANS));
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / segments;
    return { x: snap(center.x + Math.cos(angle) * radius), y: snap(center.y + Math.sin(angle) * radius) };
  });
}

/** Stepped nested rules: the outermost heaviest, insets increasing inward. */
function nestedRules(aspect: number, count: number, genome: BaseGenome, density: number): FrameSpec[] {
  const margin = 0.045;
  const gap = 0.05;
  const rules: FrameSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    const halfHeight = 1 - margin - index * gap;
    const halfWidth = aspect - margin - index * gap;
    const weight = index === 0 ? 0.019 : index === count - 1 ? 0.007 : 0.011;
    const step = 0.055 * genome.cornerScale;
    const steps = genome.zigguratSteps;
    const s = (step * 2) / steps;

    for (const signX of [-1, 1] as const) {
      const points: Point2[] = [{ x: 0, y: halfHeight }];
      for (let k = steps; k >= 1; k -= 1) {
        points.push({ x: signX * (halfWidth - k * s), y: halfHeight - (steps - k) * s });
        points.push({ x: signX * (halfWidth - k * s), y: halfHeight - (steps - k + 1) * s });
      }
      points.push({ x: signX * halfWidth, y: halfHeight - steps * s });
      points.push({ x: signX * halfWidth, y: -halfHeight + steps * s });
      for (let k = 1; k <= steps; k += 1) {
        points.push({ x: signX * (halfWidth - k * s), y: -halfHeight + (steps - k + 1) * s });
        points.push({ x: signX * (halfWidth - k * s), y: -halfHeight + (steps - k) * s });
      }
      points.push({ x: 0, y: -halfHeight });
      rules.push({
        points,
        ...stroke(weight, 0.04, -index * 0.015, 0.05 + index * 0.04),
        partDir: signX,
      });
    }
  }
  void density;
  return rules;
}

/** One quarter polar grid at the top-right corner; callers reflect it elsewhere. */
function cornerFan(aspect: number, genome: BaseGenome, density: number): FrameSpec[] {
  const origin: Point2 = { x: aspect - 0.02, y: 1 - 0.02 };
  const baseAngle = Math.PI; // pointing left along the top edge
  // A corner fan must stay inside its quadrant: wider raySpread adds ribs, not sweep.
  const span = Math.PI * 0.5 * Math.min(1, genome.raySpread);
  const ribs = Math.max(3, Math.round((3 + density * 4) * genome.rayDensity));
  const reach = CORNER_FAN_REACH * genome.rayReach;
  const rails: FrameSpec[] = [];

  for (let index = 0; index < ribs; index += 1) {
    const fraction = ribs === 1 ? 0 : index / (ribs - 1);
    const angle = baseAngle + fraction * span;
    const length = reach * (1 - fraction * 0.22);
    const end = {
      x: snap(origin.x + Math.cos(angle) * length),
      y: snap(origin.y + Math.sin(angle) * length),
    };
    if (Math.hypot(end.x - origin.x, end.y - origin.y) < MIN_RAY_LENGTH) continue;
    rails.push({
      points: [origin, end],
      ...stroke(0.009, 0.035, -0.02, 0.16 + fraction * 0.05),
      partDir: -1,
    });
  }

  for (let arc = 1; arc <= CORNER_FAN_ARCS; arc += 1) {
    const radius = (reach * arc) / CORNER_FAN_ARCS;
    rails.push({
      points: arcPoints(origin, radius, baseAngle, baseAngle + span),
      ...stroke(arc === CORNER_FAN_ARCS ? 0.011 : 0.006, 0.03, -0.03, 0.2 + arc * 0.03),
      partDir: -1,
    });
  }

  // Ruler refinement: finer ribs between the primary ribs.
  if (genome.fractalDepth > 0) {
    const slots = (ribs - 1) * 2 ** genome.fractalDepth;
    for (let k = 1; k < slots; k += 1) {
      const level = genome.fractalDepth - twoAdicValuation(k, genome.fractalDepth);
      if (level === 0) continue;
      const length = reach * Math.pow(genome.fractalRatio, level);
      if (length < MIN_RAY_LENGTH) continue;
      const angle = baseAngle + (span * k) / slots;
      rails.push({
        points: [
          origin,
          { x: snap(origin.x + Math.cos(angle) * length), y: snap(origin.y + Math.sin(angle) * length) },
        ],
        ...stroke(0.009 * Math.pow(0.72, level), 0.03, -0.04, 0.2 + level * 0.02),
        partDir: -1,
        role: 'fractal',
      });
    }
  }
  return rails;
}

function allCornerFans(aspect: number, genome: BaseGenome, density: number): FrameSpec[] {
  const topRight = cornerFan(aspect, genome, density);
  const topLeft = reflectX(topRight);
  const bottomRight = reflectY(topRight);
  const bottomLeft = reflectY(reflectX(topRight));
  return [...topRight, ...topLeft, ...bottomRight, ...bottomLeft];
}

/** Perpendicular ticks along all four straight runs, alternating weight. */
function reeding(aspect: number, genome: BaseGenome, density: number): FrameSpec[] {
  const count = Math.min(
    MAX_REED_PER_RUN,
    Math.max(MIN_REED_PER_RUN, Math.round(6 + density * 14) + genome.wingDelta)
  );
  const tooth = 0.05 * genome.wingSweep;
  const runStart = CORNER_FAN_REACH * 0.75;
  const rails: FrameSpec[] = [];

  // One run is generated from the mid-edge toward the top-right corner, then
  // reflected into all four runs, so every edge is reeded identically.
  const buildRun = (
    toPoint: (t: number) => Point2,
    direction: Point2,
    lengthAt: (t: number) => number
  ): FrameSpec[] =>
    (
      Array.from({ length: count }, (_, index) => {
      const t = count === 1 ? 0 : index / (count - 1);
      const from = toPoint(t);
      const length = lengthAt(t);
      if (length < MIN_TICK_LENGTH) return null;
      return {
        points: [from, { x: snap(from.x + direction.x * length), y: snap(from.y + direction.y * length) }],
        ...stroke(index % 2 === 0 ? 0.007 : 0.004, 0.025, -0.01, 0.22 + index * 0.006),
        partDir: 1,
      };
    }) as Array<FrameSpec | null>).filter((spec): spec is FrameSpec => spec !== null);

  const vertical = buildRun(
    (t) => ({ x: runStart + (aspect - 2 * runStart) * t, y: 1 - REED_INSET }),
    { x: 0, y: -1 },
    (t) => tooth * (1 - t * 0.62)
  );
  const horizontal = buildRun(
    (t) => ({ x: aspect - REED_INSET, y: runStart + (1 - 2 * runStart) * t }),
    { x: -1, y: 0 },
    (t) => tooth * (1 - t * 0.62)
  );

  for (const run of [vertical, horizontal]) {
    rails.push(...run, ...reflectX(run), ...reflectY(run), ...reflectY(reflectX(run)));
  }

  // Recursion: a half-height sub-tick midway between ticks.
  if (genome.fractalDepth > 0) {
    const subdivide = (run: FrameSpec[], along: 'x' | 'y', span: number): FrameSpec[] =>
      run.slice(0, Math.max(0, run.length - 1)).flatMap((spec) => {
        const [start] = spec.points;
        const height = Math.abs(start.y - spec.points[1].y) * genome.fractalRatio;
        if (height < MIN_TICK_LENGTH) return [];
        const step = (span / Math.max(1, count - 1)) * 0.5;
        const point =
          along === 'x'
            ? { x: snap(start.x + step), y: start.y }
            : { x: start.x, y: snap(start.y - step) };
        const tip =
          along === 'x'
            ? { x: point.x, y: snap(point.y - height) }
            : { x: snap(point.x - height), y: point.y };
        return [
          {
            points: [point, tip],
            ...stroke(spec.width * 0.7, spec.depth, spec.z - 0.01, spec.delay + 0.02),
            partDir: 1,
            role: 'fractal' as const,
          },
        ];
      });

    for (const run of [
      subdivide(vertical, 'x', aspect - 2 * runStart),
      subdivide(horizontal, 'y', 1 - 2 * runStart),
    ]) {
      rails.push(...run, ...reflectX(run), ...reflectY(run), ...reflectY(reflectX(run)));
    }
  }
  return rails;
}

/** The fine final rule separating the border from the image area. */
function innerHairline(aspect: number, density: number): FrameSpec[] {
  const inset = 0.045 + 0.05 * (1 + Math.round(density * 3)) + 0.035;
  const halfHeight = 1 - inset;
  const halfWidth = aspect - inset;
  return [
    {
      closed: true,
      points: [
        { x: -halfWidth, y: halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: -halfWidth, y: -halfHeight },
      ],
      ...stroke(0.005, 0.02, 0.0, 0.3),
      partDir: 1,
    },
  ];
}

export function buildEdgeBorder(request: EdgeBorderRequest): EdgeBorderGeometry {
  const aspect = Math.min(3.2, Math.max(0.5, request.aspect));
  const genome = clampGenome(request.genome);
  const density = Math.min(1, Math.max(0, request.density));
  const nestedCount = Math.min(MAX_NESTED_RULES, 1 + Math.round(density * 3));

  const specs = [
    ...nestedRules(aspect, nestedCount, genome, density),
    ...allCornerFans(aspect, genome, density),
    ...reeding(aspect, genome, density),
    ...innerHairline(aspect, density),
  ];

  const extentX = Math.max(...specs.flatMap((spec) => spec.points.map((point) => Math.abs(point.x))));
  const extentY = Math.max(...specs.flatMap((spec) => spec.points.map((point) => Math.abs(point.y))));
  return { specs, extentX, extentY };
}

/** Camera-space scale that makes unit viewport coordinates fill the frustum exactly. */
export function viewportScaleAtDistance(distance: number, fovRadians: number): number {
  return distance * Math.tan(fovRadians / 2);
}
