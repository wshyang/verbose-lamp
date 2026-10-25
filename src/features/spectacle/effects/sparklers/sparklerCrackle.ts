import { hash01 } from '@/shared/lib/random';
import type { SparkSpawn } from '../../particles/particlePool';

/**
 * Party-sparkler crackle geometry (ADDENDUM-025). Where the old "orb" was a
 * soft fireball, a sparkler is a white-hot point throwing fine straight
 * sparks in every direction, re-rolled every few dozen milliseconds so the
 * head crackles. Pure and deterministic: the renderer only strokes lines.
 */

export interface CrackleRay {
  /** Radians, full circle. */
  angle: number;
  /** Pixels from the core to the spark tip. */
  length: number;
  /** Stroke width in pixels; sparklers are hairline, never flame tongues. */
  width: number;
  /** 0..1 stroke opacity. */
  alpha: number;
}

export interface SparklerBurst {
  rays: readonly CrackleRay[];
  /** White-hot centre, pixels. */
  coreRadius: number;
  /** Warm halo around the centre, pixels. */
  haloRadius: number;
  /** 0..1 brightness shimmer for this crackle bucket. */
  flicker: number;
}

export interface SparklerBurstRequest {
  seed: number;
  tMs: number;
  /** Pixels-per-design-unit scale (min(viewport) / 700 in the renderer). */
  scale: number;
}

const CRACKLE_BUCKET_MS = 45;
const MIN_RAYS = 12;
const RAY_SPREAD = 7;

function safeScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function crackleRay(request: SparklerBurstRequest & { index: number; count: number; bucket: number }): CrackleRay {
  const { seed, index, count, bucket } = request;
  const scale = safeScale(request.scale);
  const jitter = (hash01(seed * 131 + index, bucket) - 0.5) * (Math.PI / count);
  const length = (9 + hash01(seed * 57 + index * 3, bucket + 7) * 27) * scale;
  return {
    angle: (index / count) * Math.PI * 2 + jitter,
    length,
    width: (1 + hash01(index, bucket + seed) * 1.1) * scale,
    alpha: 0.45 + hash01(seed + index * 11, bucket + 3) * 0.55,
  };
}

/** One crackle frame of a sparkler head. Same seed + bucket => same burst. */
export function sparklerBurstAt(request: SparklerBurstRequest): SparklerBurst {
  const scale = safeScale(request.scale);
  const bucket = Math.floor(request.tMs / CRACKLE_BUCKET_MS);
  const count = MIN_RAYS + Math.floor(hash01(request.seed, bucket) * RAY_SPREAD);
  const rays = Array.from({ length: count }, (_, index) =>
    crackleRay({ ...request, index, count, bucket }),
  );
  return {
    rays,
    coreRadius: 3.2 * scale,
    haloRadius: 15 * scale,
    flicker: 0.7 + hash01(request.seed * 7, bucket) * 0.3,
  };
}

export interface SparklerEmissionRequest {
  seed: number;
  tMs: number;
  x: number;
  y: number;
  /** Head travel direction (unit-ish); sparks bias backwards into a trail. */
  dirX: number;
  dirY: number;
  scale: number;
}

const EMISSIONS_PER_FRAME = 3;

/**
 * Loose sparks shed by a moving sparkler head this frame. High glitter makes
 * the trail twinkle out rather than fading like smoke.
 */
export function sparklerEmissions(request: SparklerEmissionRequest): readonly SparkSpawn[] {
  const scale = safeScale(request.scale);
  const bucket = Math.floor(request.tMs / 16);
  return Array.from({ length: EMISSIONS_PER_FRAME }, (_, i) => {
    const angle = hash01(request.seed * 31 + i, bucket) * Math.PI * 2;
    const speed = (26 + hash01(i, bucket + request.seed) * 74) * scale;
    return {
      x: request.x,
      y: request.y,
      vx: Math.cos(angle) * speed - request.dirX * 130 * scale,
      vy: Math.sin(angle) * speed - request.dirY * 130 * scale,
      k: 1.6,
      g: 150,
      lifeMs: 420 + hash01(request.seed + i, bucket) * 260,
      size: 1.9 * scale,
      band: 0.18,
      glitterRate: 16,
      seed: request.seed * 7 + i,
    };
  });
}
