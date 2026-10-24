import { applyIntricacy } from './grammar';
import { Intricacy, Point2, PolylineSpec, PosterBorderStyle, RailKind } from './types';

export interface PosterBorderRequest {
  halfWidth: number;
  halfHeight: number;
  style: PosterBorderStyle;
}

interface CornerFanOptions {
  x: number;
  y: number;
  inwardX: number;
  inwardY: number;
  radius: number;
  rayCount: number;
  arcCount: number;
  delay: number;
  railWidth: number;
}

interface RailRequest {
  points: Point2[];
  width: number;
  kind: RailKind;
  delay: number;
  z: number;
  closed?: boolean;
}

interface RectangleRequest {
  halfWidth: number;
  halfHeight: number;
  inset: number;
  cornerCut: number;
  width: number;
  kind: RailKind;
  delay: number;
  z: number;
}

interface EdgeClaspRequest {
  center: Point2;
  radius: number;
  width: number;
  delay: number;
}

interface BorderBandRequest {
  halfWidth: number;
  halfHeight: number;
  unit: number;
  width: number;
}

interface CornerCollectionRequest {
  halfWidth: number;
  halfHeight: number;
  radius: number;
  rayCount: number;
  arcCount: number;
  railWidth: number;
}

const clampLevel = (level: number) => Math.min(4, Math.max(1, Math.round(level)));
const clampDetail = (detail: Intricacy) => Math.min(1, Math.max(0, detail));

function makeRail(request: RailRequest): PolylineSpec {
  return {
    ...request,
    depth: request.width * 1.7,
    closed: request.closed ?? false,
    partDir: 0,
  };
}

function rectangularRail(request: RectangleRequest): PolylineSpec {
  const { halfWidth, halfHeight, inset, cornerCut, width, kind, delay, z } = request;
  const hw = Math.max(0.01, halfWidth - inset);
  const hh = Math.max(0.01, halfHeight - inset);
  const cut = Math.min(cornerCut, hw * 0.25, hh * 0.25);
  const points = [
    { x: -hw + cut, y: hh },
    { x: hw - cut, y: hh },
    { x: hw, y: hh - cut },
    { x: hw, y: -hh + cut },
    { x: hw - cut, y: -hh },
    { x: -hw + cut, y: -hh },
    { x: -hw, y: -hh + cut },
    { x: -hw, y: hh - cut },
  ];
  return makeRail({ points, width, kind, delay, z, closed: true });
}

/** Returns a unit ray sweeping from the horizontal inward edge to the vertical one. */
export function posterFanDirection(inwardX: number, inwardY: number, t: number): Point2 {
  const direction = { x: inwardX * (1 - t), y: inwardY * t };
  const length = Math.hypot(direction.x, direction.y) || 1;
  return { x: direction.x / length, y: direction.y / length };
}

function fanRays(options: CornerFanOptions): PolylineSpec[] {
  const { x, y, inwardX, inwardY, radius, rayCount, delay, railWidth } = options;
  const last = Math.max(1, rayCount - 1);
  return Array.from({ length: rayCount }, (_, index) => {
    const direction = posterFanDirection(inwardX, inwardY, index / last);
    const start = radius * 0.08;
    const end = radius * (0.86 + (index % 2) * 0.08);
    const isCenter = index === Math.floor(last / 2);
    return makeRail({
      points: [
        { x: x + direction.x * start, y: y + direction.y * start },
        { x: x + direction.x * end, y: y + direction.y * end },
      ],
      width: isCenter ? railWidth * 1.4 : railWidth * 0.85,
      kind: 'ray',
      delay: delay + index * 0.008,
      z: -0.025,
    });
  });
}

function fanArcs(options: CornerFanOptions): PolylineSpec[] {
  const { x, y, inwardX, inwardY, radius, arcCount, delay, railWidth } = options;
  return Array.from({ length: arcCount }, (_, index) => {
    const arcRadius = radius * (0.36 + index * 0.2);
    const segments = 5 + index;
    const points = Array.from({ length: segments + 1 }, (_, segment) => {
      const direction = posterFanDirection(inwardX, inwardY, segment / segments);
      return { x: x + direction.x * arcRadius, y: y + direction.y * arcRadius };
    });
    return makeRail({
      points,
      width: railWidth * 0.68,
      kind: 'arch',
      delay: delay + 0.04 + index * 0.02,
      z: -0.035,
    });
  });
}

function steppedBands(options: CornerFanOptions): PolylineSpec[] {
  const { x, y, inwardX, inwardY, radius, delay, railWidth } = options;
  return [0.32, 0.58].map((fraction) => {
    const distance = radius * fraction;
    return makeRail({
      points: [
        { x: x + inwardX * distance, y },
        { x: x + inwardX * distance, y: y + inwardY * distance },
        { x, y: y + inwardY * distance },
      ],
      width: railWidth,
      kind: 'chevron',
      delay: delay + 0.05,
      z: -0.015,
    });
  });
}

function makeCornerFan(options: CornerFanOptions): PolylineSpec[] {
  return [...fanRays(options), ...fanArcs(options), ...steppedBands(options)];
}

function cornerOptions(request: CornerCollectionRequest): CornerFanOptions[] {
  const { halfWidth, halfHeight, radius, rayCount, arcCount, railWidth } = request;
  return [
    { x: halfWidth, y: halfHeight, inwardX: -1, inwardY: -1, delay: 0.12 },
    { x: halfWidth, y: -halfHeight, inwardX: -1, inwardY: 1, delay: 0.12 },
    { x: -halfWidth, y: halfHeight, inwardX: 1, inwardY: -1, delay: 0.12 },
    { x: -halfWidth, y: -halfHeight, inwardX: 1, inwardY: 1, delay: 0.12 },
  ].map((corner) => ({ ...corner, radius, rayCount, arcCount, railWidth }));
}

function edgeClasp(request: EdgeClaspRequest): PolylineSpec {
  const { center, radius, width, delay } = request;
  return makeRail({
    points: [
      { x: center.x, y: center.y + radius },
      { x: center.x + radius, y: center.y },
      { x: center.x, y: center.y - radius },
      { x: center.x - radius, y: center.y },
    ],
    width,
    kind: 'diamond',
    delay,
    z: 0.01,
    closed: true,
  });
}

function edgeClasps(request: BorderBandRequest) {
  const { halfWidth, halfHeight, unit, width } = request;
  const radius = unit * 0.025;
  return [
    edgeClasp({ center: { x: halfWidth, y: 0 }, radius, width: width * 1.1, delay: 0.2 }),
    edgeClasp({ center: { x: -halfWidth, y: 0 }, radius, width: width * 1.1, delay: 0.2 }),
    edgeClasp({ center: { x: 0, y: halfHeight }, radius, width, delay: 0.2 }),
    edgeClasp({ center: { x: 0, y: -halfHeight }, radius, width, delay: 0.2 }),
  ];
}

function marginRules(request: BorderBandRequest) {
  const { halfWidth, halfHeight, unit, width } = request;
  const inset = unit * 0.11;
  const ruleWidth = width * 0.48;
  return [
    makeRail({
      points: [{ x: -halfWidth + inset, y: halfHeight - inset }, { x: halfWidth - inset, y: halfHeight - inset }],
      width: ruleWidth,
      kind: 'rule',
      delay: 0.14,
      z: -0.02,
    }),
    makeRail({
      points: [{ x: -halfWidth + inset, y: -halfHeight + inset }, { x: halfWidth - inset, y: -halfHeight + inset }],
      width: ruleWidth,
      kind: 'rule',
      delay: 0.14,
      z: -0.02,
    }),
  ];
}

function buildPosterCore(halfWidth: number, halfHeight: number, levelValue: number): PolylineSpec[] {
  const halfW = Math.max(0.1, halfWidth * 0.95);
  const halfH = Math.max(0.1, halfHeight * 0.95);
  const unit = Math.min(halfW, halfH);
  const level = clampLevel(levelValue);
  const railWidth = unit * 0.018;
  const ringGap = unit * 0.022;
  const fanRadius = unit * 0.145;
  const rays = 3 + 2 * level;
  const arcs = Math.min(3, level);
  const specs: PolylineSpec[] = [];

  for (let ring = 0; ring <= level; ring++) {
    specs.push(
      rectangularRail({
        halfWidth: halfW,
        halfHeight: halfH,
        inset: ring * ringGap,
        cornerCut: unit * (0.045 - ring * 0.002),
        width: railWidth * (ring === 0 ? 1.25 : 0.58),
        kind: ring === 0 ? 'frame' : 'arch',
        delay: ring * 0.04,
        z: -ring * unit * 0.008,
      })
    );
  }

  for (const corner of cornerOptions({
    halfWidth: halfW,
    halfHeight: halfH,
    radius: fanRadius,
    rayCount: rays,
    arcCount: arcs,
    railWidth,
  })) {
    specs.push(...makeCornerFan(corner));
  }
  const borderBand = { halfWidth: halfW, halfHeight: halfH, unit, width: railWidth };
  specs.push(...edgeClasps(borderBand));
  specs.push(...marginRules(borderBand));
  return specs;
}

interface ScaleSpecsRequest {
  specs: PolylineSpec[];
  scale: number;
}

function scaleSpecs(request: ScaleSpecsRequest): PolylineSpec[] {
  const { specs, scale } = request;
  return specs.map((spec) => ({
    ...spec,
    points: spec.points.map((point) => ({ x: point.x * scale, y: point.y * scale })),
    width: spec.width * scale,
    depth: spec.depth * scale,
    z: spec.z * scale,
  }));
}

/** Creates a deterministic full-perimeter frame in camera-plane units. */
export function buildPosterBorderSpecs(request: PosterBorderRequest): PolylineSpec[] {
  const core = buildPosterCore(request.halfWidth, request.halfHeight, request.style.level);
  const unit = Math.min(request.halfWidth, request.halfHeight) * 0.95;
  const scale = 0.422 / Math.max(0.001, unit * 0.04);
  const scaledCore = scaleSpecs({ specs: core, scale });
  const detailed = applyIntricacy(scaledCore, clampDetail(request.style.intricacy));
  return scaleSpecs({ specs: detailed, scale: 1 / scale });
}