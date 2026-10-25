import { clamp01, easeInQuad, easeOutCubic, quadBezier } from '../../model/timeline';
import type { NormPoint } from '../../model/types';
import type { OrbPlan } from '../orbs/orbPlan';

/** Where one transition sparkler is, which way it is heading, and how far along its flight. */
export interface SparklerPose {
  point: NormPoint;
  /** Local heading (a small step ahead along the curve), in normalised units. */
  dx: number;
  dy: number;
  /** 0 at launch, 1 at landing. */
  progress: number;
}

/** How long a landed sparkler is still drawn, so the last frame of the flight is not cut short. */
const LANDING_GRACE_MS = 30;
const HEADING_LOOKAHEAD = 0.02;

/**
 * Pure flight path of sparkler `trackIndex` at time `tMs`: a quadratic arc between the origin and
 * the track's off-screen target. Outward flights ease in, inward ones ease out, so they arrive
 * with the same snap the orb transition always had. Null outside the flight window.
 */
export function sparklerPose(plan: OrbPlan, trackIndex: number, tMs: number): SparklerPose | null {
  if (tMs < plan.travelStartMs || tMs > plan.travelEndMs + LANDING_GRACE_MS) return null;
  const progress = clamp01((tMs - plan.travelStartMs) / (plan.travelEndMs - plan.travelStartMs));
  const track = plan.tracks[trackIndex];
  const isOutward = plan.direction === 'outward';
  const eased = isOutward ? easeInQuad(progress) : easeOutCubic(progress);
  const curve = {
    p0: isOutward ? plan.origin : track.target,
    p1: track.control,
    p2: isOutward ? track.target : plan.origin,
  };
  const point = quadBezier(curve, eased);
  const ahead = quadBezier(curve, Math.min(1, eased + HEADING_LOOKAHEAD));
  return { point, dx: ahead.x - point.x, dy: ahead.y - point.y, progress };
}
