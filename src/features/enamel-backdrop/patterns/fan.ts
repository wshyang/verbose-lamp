import type { FanPattern, FieldFrame, PixelPoint } from '../types';

/** Hub depth per lift step, as a share of the panel: lift 2 sits 8 % below the edge, as B's fan did. */
const LIFT_STEP = 0.04;

/**
 * The Deco Fan, lifted from avatar-studio implementation B (ADDENDUM-019): rays radiate
 * from a hub below the bottom edge. Every point sits above the hub, so the angle stays in
 * (0, π) and the field has no seam.
 */
export function fanField(point: PixelPoint, frame: FieldFrame, pattern: FanPattern): number {
  const dx = (point.x + 0.5) / frame.size - 0.5;
  const dy = 1 + pattern.lift * LIFT_STEP - (point.y + 0.5) / frame.size;
  return (Math.atan2(dy, dx) / Math.PI) * pattern.rays * frame.bands;
}
