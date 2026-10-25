import { farthestCornerDistance } from '../../model/geometry';
import { easeInOutCubic } from '../../model/timeline';
import type { NormPoint, SunburstWipeParams } from '../../model/types';

export interface IrisPlan {
  crossfade: boolean;
  durationMs: number;
  coverEndMs: number;
  holdEndMs: number;
  onCoveredMs: number;
  origin: NormPoint;
  rays: number;
  variant: 'iris' | 'fan';
}

const CROSSFADE_DURATION_MS = 400;
const CROSSFADE_COVER_END_MS = 180;
const CROSSFADE_HOLD_END_MS = 220;

function planFields(params: SunburstWipeParams): Pick<IrisPlan, 'origin' | 'rays' | 'variant'> {
  return { origin: params.origin, rays: params.rays ?? 24, variant: params.variant ?? 'iris' };
}

export function planIris(params: SunburstWipeParams): IrisPlan {
  const duration = params.durationMs ?? 1800;
  const coverEnd = Math.round(duration * 0.4);
  return {
    ...planFields(params),
    crossfade: false,
    durationMs: duration,
    coverEndMs: coverEnd,
    holdEndMs: coverEnd + Math.round(duration * 0.18),
    onCoveredMs: coverEnd,
  };
}

/** Reduced-motion plan: a short gold crossfade instead of the growing iris. */
export function planIrisCrossfade(params: SunburstWipeParams): IrisPlan {
  return {
    ...planFields(params),
    crossfade: true,
    durationMs: CROSSFADE_DURATION_MS,
    coverEndMs: CROSSFADE_COVER_END_MS,
    holdEndMs: CROSSFADE_HOLD_END_MS,
    onCoveredMs: CROSSFADE_COVER_END_MS,
  };
}

/**
 * Covering radius at time t. At `onCovered` it is at least the distance to
 * the farthest viewport corner, for any origin (tested).
 */
export function irisRadiusAt(plan: IrisPlan, tMs: number, aspect: number): number {
  const full = farthestCornerDistance(plan.origin, aspect) * 1.02;
  if (tMs <= plan.coverEndMs) return easeInOutCubic(tMs / plan.coverEndMs) * full;
  if (tMs <= plan.holdEndMs) return full;
  const u = (tMs - plan.holdEndMs) / (plan.durationMs - plan.holdEndMs);
  return full * (1 - easeInOutCubic(Math.min(1, u)));
}

/** Below this the iris is a speck; the effect skips drawing it. Measured in pixels. */
export const MIN_VISIBLE_RADIUS_PX = 1;

/**
 * Covering radius in pixels. `irisRadiusAt` works in aspect-corrected units
 * where 1 is the viewport height; compare against pixel thresholds only after
 * converting here (comparing units to pixels hid the iris on most screens).
 */
export function irisRadiusPx(plan: IrisPlan, tMs: number, viewport: { w: number; h: number }): number {
  return irisRadiusAt(plan, tMs, viewport.w / Math.max(1, viewport.h)) * viewport.h;
}
