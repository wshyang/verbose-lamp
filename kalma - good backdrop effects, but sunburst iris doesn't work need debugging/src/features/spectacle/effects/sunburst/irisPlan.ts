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

export function planIris(params: SunburstWipeParams, reducedMotion: boolean): IrisPlan {
  const duration = reducedMotion ? 400 : (params.durationMs ?? 1800);
  const coverEnd = reducedMotion ? 180 : Math.round(duration * 0.4);
  const holdEnd = reducedMotion ? 220 : coverEnd + Math.round(duration * 0.18);
  return {
    crossfade: reducedMotion,
    durationMs: duration,
    coverEndMs: coverEnd,
    holdEndMs: holdEnd,
    onCoveredMs: coverEnd,
    origin: params.origin,
    rays: params.rays ?? 24,
    variant: params.variant ?? 'iris',
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