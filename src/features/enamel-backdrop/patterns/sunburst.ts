import type { FieldFrame, PixelPoint, SunburstPattern } from '../types';
import { centredOffset } from './space';

/** Radians of twist per cell of radius per twist step (reference `SUNBURST_TWIST_STEP`). */
export const SUNBURST_TWIST_STEP = 0.006;

/** Rays from the centre, optionally curved into a spiral. One unit of field per band. */
export function sunburstField(point: PixelPoint, frame: FieldFrame, pattern: SunburstPattern): number {
  const { dx, dy } = centredOffset(point, frame.size);
  const radius = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) + radius * pattern.twist * SUNBURST_TWIST_STEP;
  const sector = (angle / (Math.PI * 2)) * pattern.rays;
  return sector * frame.bands;
}
