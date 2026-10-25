import { hash01, mulberry32 } from '@/shared/lib/random';
import { clamp01 } from './timeline';
import type { NormPoint } from './types';
import { DEFAULT_SEED } from '@/shared/lib/random';

/**
 * Party sparklers: a lit wire that throws a dense, crackling spray of sparks.
 * The user's brief calls these "orbs"; ADDENDUM-025 records that a party
 * sparkler is what the transition and the standalone effect must look like.
 *
 * Everything here is pure and seeded. The renderer converts to pixels and the
 * engine emits into the particle pool, so the same plan drives the standalone
 * effect, the orb transition and any future host.
 */
export const DEFAULT_SPARKLER_SEED = DEFAULT_SEED;

/** One spark in the spray, in normalised viewport units per second. */
export interface SparklerSpark {
  angle: number;
  speed: number;
  lifeMs: number;
  /** Sprite radius, as a fraction of the smaller viewport dimension. */
  size: number;
  band: number;
  glitterRate: number;
  seed: number;
}

export interface SparklerPlan {
  origin: NormPoint;
  seed: number;
  /** Core radius, fraction of the smaller viewport dimension. */
  headRadius: number;
  durationMs: number;
  growMs: number;
  fadeMs: number;
  /** Sparks per second at full heat. */
  emissionRate: number;
  drag: number;
  gravity: number;
  /** 0..1 smoke haze density. */
  smoke: number;
  sparks: readonly SparklerSpark[];
}

export interface SparklerRequest {
  origin: NormPoint;
  seed?: number;
  /** 0..1 — scales emission rate, head size and smoke. */
  intensity?: number;
  durationMs?: number;
}

export interface SparklerShowRequest extends SparklerRequest {
  /** 1..5 sparklers fanned around the origin. */
  count?: number;
}

export interface SparklerSparkSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  k: number;
  g: number;
  lifeMs: number;
  size: number;
  band: number;
  glitterRate: number;
  seed: number;
}

const DEFAULT_DURATION_MS = 2600;
const DEFAULT_INTENSITY = 0.75;
const GROW_MS = 180;
const FADE_MS = 620;
/** Shortest burn that still shows a strike and a fade, and the longest a canvas should be asked to hold. */
const MIN_DURATION_MS = GROW_MS + FADE_MS;
const MAX_DURATION_MS = 30_000;
const BASE_RATE = 520;
const SPARKS_PER_UNIT = 260;
const MAX_SPARKLERS = 5;
const FAN_SPACING = 0.085;
const FAN_RISE = 0.022;

function resolveIntensity(value: number | undefined): number {
  return clamp01(value ?? DEFAULT_INTENSITY);
}

/** A caller-supplied burn: unset or non-finite means the default, anything else is held to a sane range. */
function resolveDuration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, value));
}

function buildSparks(seed: number, intensity: number): readonly SparklerSpark[] {
  const random = mulberry32(seed);
  const count = Math.round(SPARKS_PER_UNIT * (0.55 + intensity * 0.9));
  return Array.from({ length: count }, (_, index) => ({
    angle: random() * Math.PI * 2,
    speed: 0.16 + random() * 0.34,
    lifeMs: 240 + random() * 620,
    size: 0.0022 + random() * 0.0032,
    band: random() * 0.1,
    glitterRate: 12 + Math.floor(random() * 22),
    seed: index * 2654435761,
  }));
}

/** One sparkler at `origin`. */
export function planSparkler(request: SparklerRequest): SparklerPlan {
  const intensity = resolveIntensity(request.intensity);
  const seed = request.seed ?? DEFAULT_SPARKLER_SEED;
  return {
    origin: request.origin,
    seed,
    headRadius: 0.006 + intensity * 0.01,
    durationMs: resolveDuration(request.durationMs),
    growMs: GROW_MS,
    fadeMs: FADE_MS,
    emissionRate: BASE_RATE * (0.45 + intensity * 0.75),
    drag: 1.35,
    gravity: 0.42,
    smoke: 0.18 + intensity * 0.22,
    sparks: buildSparks(seed, intensity),
  };
}

/**
 * A fan of 1–5 sparklers around the origin, the "party" arrangement. Offsets
 * are deterministic and mirrored, so a pair reads as held in two hands.
 */
export function planSparklerShow(request: SparklerShowRequest): readonly SparklerPlan[] {
  const count = Math.min(MAX_SPARKLERS, Math.max(1, Math.round(request.count ?? 1)));
  const centre = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => {
    const offset = index - centre;
    return planSparkler({
      ...request,
      seed: (request.seed ?? DEFAULT_SPARKLER_SEED) + index * 97,
      origin: {
        x: clamp01(request.origin.x + offset * FAN_SPACING),
        y: clamp01(request.origin.y + Math.abs(offset) * FAN_RISE),
      },
    });
  });
}

/**
 * Head brightness 0..1: an 180 ms strike, a steady burn with a ±12 % crackle
 * wobble, then the fade. Zero outside the plan window.
 */
export function sparklerHeat(plan: SparklerPlan, tMs: number): number {
  if (tMs < 0 || tMs > plan.durationMs) return 0;
  const grown = clamp01(tMs / plan.growMs);
  const left = plan.durationMs - tMs;
  const fading = plan.fadeMs > 0 ? clamp01(left / plan.fadeMs) : 1;
  const wobble = 1 + (hash01(plan.seed, Math.floor(tMs / 55)) - 0.5) * 0.24;
  return clamp01(grown * fading * wobble);
}

/** Absolute emission ordinals for one frame: `count` sparks starting at `start`. */
export interface SparklerEmissionRange {
  start: number;
  count: number;
}

/**
 * Sparks emitted between two times. Derived from absolute time, so splitting a
 * frame into two calls emits exactly as many sparks as one call — the property
 * that keeps recordings deterministic.
 */
export function sparklerEmissionRange(
  plan: SparklerPlan,
  fromMs: number,
  toMs: number
): SparklerEmissionRange {
  const from = Math.max(0, Math.min(plan.durationMs, fromMs));
  const to = Math.max(0, Math.min(plan.durationMs, toMs));
  if (to <= from) return { start: Math.floor(from * plan.emissionRate / 1000), count: 0 };
  const perSecond = plan.emissionRate / 1000;
  const start = Math.floor(from * perSecond);
  const end = Math.floor(to * perSecond);
  return { start, count: Math.max(0, end - start) };
}

/**
 * Absolute emission index `k` maps to a recipe slot plus a per-slot jitter, so
 * the spray never repeats on a visible beat and stays reproducible.
 */
export function sparklerSpawn(plan: SparklerPlan, index: number): SparklerSparkSpawn {
  const spark = plan.sparks[((index % plan.sparks.length) + plan.sparks.length) % plan.sparks.length];
  const jitter = hash01(index, plan.seed);
  const angle = spark.angle + (jitter - 0.5) * 0.5;
  const speed = spark.speed * (0.78 + jitter * 0.44);
  return {
    x: plan.origin.x,
    y: plan.origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    k: plan.drag,
    g: plan.gravity,
    lifeMs: spark.lifeMs * (0.82 + jitter * 0.36),
    size: spark.size,
    band: spark.band,
    glitterRate: spark.glitterRate,
    seed: spark.seed + index,
  };
}

/** True once every sparkler in the show has burnt out. */
export function isSparklerShowDone(plans: readonly SparklerPlan[], tMs: number): boolean {
  return plans.every((plan) => tMs > plan.durationMs);
}
