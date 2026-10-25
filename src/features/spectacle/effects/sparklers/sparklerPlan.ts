import { hash01, mulberry32 } from '@/shared/lib/random';
import type { NormPoint, SparklerParams } from '../../model/types';

/**
 * A hand-held party sparkler: a bent wire planted in a stand, with a burning tip
 * that throws sparkles (ADDENDUM-027). The four "orb" transition configurations in
 * ADDENDUM-020 are what the user calls sparkler transitions; this module is the
 * stand-alone effect.
 *
 * Pure and seeded: no canvas, no clock, no DOM.
 */

export interface SparklerStick {
  index: number;
  /** Where the wire meets the stand, in normalised viewport space. */
  anchor: NormPoint;
  /** Lean of the wire, radians from vertical (positive leans right). */
  tilt: number;
  /** Wire length, in viewport fractions. */
  length: number;
  swayPhase: number;
  /** Radians per second; 0 for the reduced-motion plan. */
  swayRate: number;
  burnStartMs: number;
  burnEndMs: number;
  /** 0 = champagne, 1 = hot gold; picked per stick so the fan is not uniform. */
  warmth: number;
}

export interface SparklerPlan {
  origin: NormPoint;
  durationMs: number;
  sticks: readonly SparklerStick[];
  /** Reduced motion: no sway, shorter reach, same burn window. */
  still: boolean;
}

/** One flying sparkle, in normalised viewport space. */
export interface Sparkle {
  x: number;
  y: number;
  /** Direction of travel, radians. */
  angle: number;
  size: number;
  /** 0..1 of its life left, used for alpha. */
  life: number;
  warmth: number;
  /** Streak length as a multiple of `size`. */
  trail: number;
}

export const MAX_STICKS = 6;
export const DEFAULT_STICK_COUNT = 3;
export const DEFAULT_DURATION_MS = 3200;
export const DEFAULT_SPREAD = 0.18;
export const STICK_LENGTH = 0.3;
/** Sparkles per stick per frame at full quality and full intensity. */
export const SPARKS_PER_FRAME = 7;

const DEFAULTS = {
  origin: { x: 0.5, y: 0.66 } as const,
  count: DEFAULT_STICK_COUNT,
  durationMs: DEFAULT_DURATION_MS,
  spread: DEFAULT_SPREAD,
  seed: 1925,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Number of sticks actually used, clamped into the supported fan. */
export function resolveStickCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count)) return DEFAULTS.count;
  return clamp(Math.round(count), 1, MAX_STICKS);
}

function buildStick(index: number, count: number, request: {
  origin: NormPoint;
  spread: number;
  durationMs: number;
  rng: () => number;
}): SparklerStick {
  const { origin, spread, durationMs, rng } = request;
  const offset = count === 1 ? 0 : (index / (count - 1) - 0.5) * spread * 2;
  return {
    index,
    anchor: { x: origin.x + offset, y: origin.y + Math.abs(offset) * 0.25 },
    tilt: offset * 0.55 + (rng() - 0.5) * 0.12,
    length: STICK_LENGTH * (0.9 + rng() * 0.2),
    swayPhase: rng() * Math.PI * 2,
    swayRate: 1.6 + rng() * 0.8,
    burnStartMs: index * 90,
    burnEndMs: durationMs - 220,
    warmth: rng(),
  };
}

/** Full-motion plan: a fan of sparklers lighting left to right. */
export function planSparklers(params: SparklerParams = {}): SparklerPlan {
  return buildPlan(params, false);
}

/** Reduced-motion plan: the same fan, standing still, with a shorter spark reach. */
export function planSparklerStill(params: SparklerParams = {}): SparklerPlan {
  return buildPlan(params, true);
}

function buildPlan(params: SparklerParams, still: boolean): SparklerPlan {
  const origin = params.origin ?? DEFAULTS.origin;
  const durationMs = params.durationMs ?? DEFAULTS.durationMs;
  const spread = params.spread ?? DEFAULTS.spread;
  const count = resolveStickCount(params.count);
  const rng = mulberry32(params.seed ?? DEFAULTS.seed);
  const sticks: SparklerStick[] = [];
  for (let index = 0; index < count; index += 1) {
    const stick = buildStick(index, count, { origin, spread, durationMs, rng });
    sticks.push(still ? { ...stick, swayRate: 0 } : stick);
  }
  return { origin, durationMs, sticks, still };
}

/** The burning tip of a stick at a moment in time, in normalised viewport space. */
export function sparklerTip(stick: SparklerStick, tMs: number): NormPoint {
  const sway = stick.swayRate === 0
    ? 0
    : Math.sin((tMs / 1000) * stick.swayRate + stick.swayPhase) * 0.06;
  const angle = stick.tilt + sway;
  return {
    x: stick.anchor.x + Math.sin(angle) * stick.length,
    y: stick.anchor.y - Math.cos(angle) * stick.length,
  };
}

/** 0 before the stick is lit, ramps up, holds, then dies away. */
export function sparklerIntensity(stick: SparklerStick, tMs: number): number {
  if (tMs <= stick.burnStartMs || tMs >= stick.burnEndMs) return 0;
  const progress = (tMs - stick.burnStartMs) / (stick.burnEndMs - stick.burnStartMs);
  const rise = Math.min(1, progress / 0.08);
  const fall = 1 - Math.max(0, (progress - 0.88) / 0.12);
  return clamp(Math.min(rise, fall), 0, 1);
}

/** The sticks alight at this instant. */
export function burningSticks(plan: SparklerPlan, tMs: number): readonly SparklerStick[] {
  return plan.sticks.filter((stick) => sparklerIntensity(stick, tMs) > 0);
}

/** True once the whole show has run its course. */
export function isSparklerShowDone(plan: SparklerPlan, tMs: number): boolean {
  return tMs >= plan.durationMs;
}

/**
 * The sparkles emitted this frame. Deterministic: the gate is a hash of the spark
 * slot and the frame number, so a replay draws the same shimmer.
 */
export function sparkleField(plan: SparklerPlan, tMs: number, density = 1): readonly Sparkle[] {
  const frame = Math.floor(tMs / 33);
  const reach = plan.still ? 0.35 : 1;
  const sparkles: Sparkle[] = [];
  for (const stick of plan.sticks) {
    const intensity = sparklerIntensity(stick, tMs);
    if (intensity <= 0) continue;
    const tip = sparklerTip(stick, tMs);
    const slots = Math.round(SPARKS_PER_FRAME * intensity * clamp(density, 0, 2));
    for (let slot = 0; slot < slots; slot += 1) {
      const seed = stick.index * 131 + slot;
      if (hash01(seed, frame) < 0.45) continue;
      const angle = hash01(seed + 17, frame) * Math.PI * 2;
      const distance = (0.02 + hash01(seed + 31, frame) * 0.13) * reach;
      sparkles.push({
        x: tip.x + Math.cos(angle) * distance,
        y: tip.y + Math.sin(angle) * distance,
        angle,
        size: 0.7 + hash01(seed + 71, frame) * 1.6,
        life: 0.35 + hash01(seed + 53, frame) * 0.55,
        warmth: hash01(seed + 97, frame),
        trail: 1.4 + hash01(seed + 113, frame) * 3,
      });
    }
  }
  return sparkles;
}
