import { offscreenTargets } from '../../model/geometry';
import { sanitizeFlashPlan, type FlashSegment } from '../../model/motionPolicy';
import type { NormPoint, SparklerTransitionParams } from '../../model/types';

export interface SparklerTrack {
  target: NormPoint;
  control: NormPoint;
}

export interface SparklerPlan {
  direction: 'outward' | 'inward';
  crossfade: boolean;
  durationMs: number;
  origin: NormPoint;
  tracks: readonly SparklerTrack[];
  flash: readonly FlashSegment[];
  onCoveredMs: number;
  travelStartMs: number;
  travelEndMs: number;
  /** Inward only: the moment all sparkler tips meet at the origin. */
  collisionMs: number | null;
}

function arcControl(from: NormPoint, to: NormPoint, sign: number): NormPoint {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = 0.16 * len * sign;
  return { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
}

function buildTracks(params: SparklerTransitionParams): readonly SparklerTrack[] {
  return offscreenTargets(params.origin, params.pattern).map((target, i) => ({
    target,
    control: arcControl(params.origin, target, i % 2 === 0 ? 1 : -1),
  }));
}

/** Reduced-motion plan: a short flash crossfade, no flying sparklers. */
export function planSparklerCrossfade(params: SparklerTransitionParams): SparklerPlan {
  return crossfadePlan(params, buildTracks(params));
}

/** Pure timeline for all four sparkler configurations (ADDENDUM-020 §3.4). */
export function planSparklerTransition(params: SparklerTransitionParams): SparklerPlan {
  const duration = params.durationMs ?? 1600;
  const tracks = buildTracks(params);
  return params.direction === 'outward'
    ? outwardPlan(params.origin, duration, tracks)
    : inwardPlan(params.origin, duration, tracks);
}

function crossfadePlan(params: SparklerTransitionParams, tracks: readonly SparklerTrack[]): SparklerPlan {
  return {
    direction: params.direction,
    crossfade: true,
    durationMs: 400,
    origin: params.origin,
    tracks,
    flash: [{ startMs: 0, attackMs: 180, holdMs: 40, decayMs: 180, peak: 0.55 }],
    onCoveredMs: 200,
    travelStartMs: 0,
    travelEndMs: 400,
    collisionMs: null,
  };
}

function outwardPlan(origin: NormPoint, duration: number, tracks: readonly SparklerTrack[]): SparklerPlan {
  const flash = sanitizeFlashPlan([
    { startMs: 0, attackMs: 120, holdMs: 260, decayMs: 620, peak: 1 },
  ]);
  return {
    direction: 'outward',
    crossfade: false,
    durationMs: duration,
    origin,
    tracks,
    flash,
    onCoveredMs: 120,
    travelStartMs: 260,
    travelEndMs: duration - 150,
    collisionMs: null,
  };
}

function inwardPlan(origin: NormPoint, duration: number, tracks: readonly SparklerTrack[]): SparklerPlan {
  const collision = Math.round(duration * 0.62);
  const flash = sanitizeFlashPlan([
    { startMs: collision, attackMs: 120, holdMs: 230, decayMs: duration - collision - 350, peak: 1 },
  ]);
  return {
    direction: 'inward',
    crossfade: false,
    durationMs: duration,
    origin,
    tracks,
    flash,
    onCoveredMs: collision + 120,
    travelStartMs: 0,
    travelEndMs: collision,
    collisionMs: collision,
  };
}

/** @deprecated The effect is a party sparkler; use the Sparkler names. */
export type OrbTrack = SparklerTrack;
/** @deprecated The effect is a party sparkler; use `SparklerPlan`. */
export type OrbPlan = SparklerPlan;
/** @deprecated Use `planSparklerCrossfade`. */
export const planOrbCrossfade = planSparklerCrossfade;
/** @deprecated Use `planSparklerTransition`. */
export const planOrbTransition = planSparklerTransition;
