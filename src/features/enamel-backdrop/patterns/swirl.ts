import type { FieldFrame, PixelPoint, SwirlPattern } from '../types';
import { REFERENCE_GRID } from './space';

/** Domain-warp ceiling: strength × frequency² never exceeds this, so the warp never folds. */
const WARP_CEILING = 0.8;

/** A domain-warped spiral (the reference "psychedelic"); arms = swirl × bands keeps it seamless. */
export function swirlField(point: PixelPoint, frame: FieldFrame, pattern: SwirlPattern): number {
  const u = (point.x + 0.5) / frame.size - 0.5;
  const v = (point.y + 0.5) / frame.size - 0.5;
  const frequency = pattern.frequency;
  const strength = (pattern.ripple / 10) * (WARP_CEILING / (frequency * frequency));
  const sweep = Math.PI * 2 * frequency;
  const warpedU = u + strength * Math.sin(sweep * v);
  const warpedV = v + strength * Math.sin(sweep * u);
  const radius = Math.hypot(warpedU, warpedV);
  const angle = Math.atan2(warpedV, warpedU);
  const arms = pattern.swirl * frame.bands;
  return (radius * REFERENCE_GRID) / pattern.scale + (arms * angle) / (Math.PI * 2);
}
