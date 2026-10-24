import type { CurvePoint } from './types';

const IDENTITY_POINTS: readonly CurvePoint[] = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
]);

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizePoints(points: readonly CurvePoint[]): CurvePoint[] {
  const sorted = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: clampUnit(point.x), y: clampUnit(point.y) }))
    .sort((left, right) => left.x - right.x);
  const unique: CurvePoint[] = [];
  for (const point of sorted) {
    if (unique.length > 0 && unique[unique.length - 1].x === point.x) unique[unique.length - 1] = point;
    else unique.push(point);
  }
  if (unique.length === 0) return [...IDENTITY_POINTS];
  if (unique[0].x > 0) unique.unshift({ x: 0, y: 0 });
  if (unique[unique.length - 1].x < 1) unique.push({ x: 1, y: 1 });
  return unique;
}

function endpointSlope(firstWidth: number, secondWidth: number, first: number, second: number): number {
  const slope = ((2 * firstWidth + secondWidth) * first - firstWidth * second) / (firstWidth + secondWidth);
  if (Math.sign(slope) !== Math.sign(first)) return 0;
  if (Math.sign(first) !== Math.sign(second) && Math.abs(slope) > Math.abs(3 * first)) return 3 * first;
  return slope;
}

function computeTangents(points: readonly CurvePoint[]): Float64Array {
  const intervals = points.slice(0, -1).map((point, index) => points[index + 1].x - point.x);
  const secants = points.slice(0, -1).map((point, index) => (points[index + 1].y - point.y) / intervals[index]);
  const tangents = new Float64Array(points.length);
  if (points.length === 2) {
    tangents.fill(secants[0]);
    return tangents;
  }
  tangents[0] = endpointSlope(intervals[0], intervals[1], secants[0], secants[1]);
  tangents[points.length - 1] = endpointSlope(
    intervals[intervals.length - 1],
    intervals[intervals.length - 2],
    secants[secants.length - 1],
    secants[secants.length - 2]
  );
  for (let index = 1; index < points.length - 1; index += 1) {
    tangents[index] = interiorTangent(intervals[index - 1], intervals[index], secants[index - 1], secants[index]);
  }
  return tangents;
}

function interiorTangent(previousWidth: number, nextWidth: number, previous: number, next: number): number {
  if (previous * next <= 0) return 0;
  const leftWeight = 2 * nextWidth + previousWidth;
  const rightWeight = nextWidth + 2 * previousWidth;
  return (leftWeight + rightWeight) / (leftWeight / previous + rightWeight / next);
}

function interpolateSegment(left: CurvePoint, right: CurvePoint, leftSlope: number, rightSlope: number, x: number): number {
  const width = right.x - left.x;
  const t = (x - left.x) / width;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * left.y + h10 * width * leftSlope + h01 * right.y + h11 * width * rightSlope;
}

export function buildCurveLut(points: readonly CurvePoint[]): Uint8Array {
  const anchors = normalizePoints(points);
  const tangents = computeTangents(anchors);
  const lut = new Uint8Array(256);
  let segment = 0;
  for (let index = 0; index < lut.length; index += 1) {
    const x = index / 255;
    while (segment < anchors.length - 2 && x > anchors[segment + 1].x) segment += 1;
    const value = interpolateSegment(
      anchors[segment], anchors[segment + 1], tangents[segment], tangents[segment + 1], x
    );
    lut[index] = Math.round(clampUnit(value) * 255);
  }
  return lut;
}

export function foldTone(value: number, folds: number): number {
  let output = clampUnit(value);
  const count = Number.isFinite(folds) ? Math.max(0, Math.floor(folds)) : 0;
  for (let index = 0; index < count; index += 1) output = Math.abs(2 * output - 1);
  return output;
}

export function buildFoldLut(folds: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => Math.round(foldTone(index / 255, folds) * 255));
}