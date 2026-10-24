import type { FieldFrame, PixelPoint, RadiancePattern } from '../types';
import { centredOffset } from './space';

/** Minkowski exponents of the four ring shapes (reference `CONCENTRIC_SHAPES`). */
export const RADIANCE_SHAPES = Object.freeze([
  { label: 'Diamond', exponent: 1 },
  { label: 'Circle', exponent: 2 },
  { label: 'Squircle', exponent: 4 },
  { label: 'Square', exponent: Infinity },
] as const);

function shapeDistance(dx: number, dy: number, exponent: number): number {
  if (exponent === Infinity) return Math.max(Math.abs(dx), Math.abs(dy));
  if (exponent === 2) return Math.sqrt(dx * dx + dy * dy);
  return (Math.abs(dx) ** exponent + Math.abs(dy) ** exponent) ** (1 / exponent);
}

/** Concentric rings in a p-norm, scalloped by a rose term. One unit of field per ring. */
export function radianceField(point: PixelPoint, frame: FieldFrame, pattern: RadiancePattern): number {
  const { dx, dy } = centredOffset(point, frame.size);
  const index = Math.min(RADIANCE_SHAPES.length - 1, Math.max(0, Math.round(pattern.shape) - 1));
  const base = shapeDistance(dx, dy, RADIANCE_SHAPES[index].exponent);
  const petals = 1 + (pattern.lobeDepth / 10) * Math.cos(pattern.lobes * Math.atan2(dy, dx));
  return Math.max(0, base * petals) / pattern.ringWidth;
}
