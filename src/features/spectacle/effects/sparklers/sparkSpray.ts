import { hash01 } from '@/shared/lib/random';
import type { SparkSpawn } from '../../particles/particlePool';
import type { PixelPoint } from './sparklerWand';

export interface CrackleRequest {
  tip: PixelPoint;
  timeMs: number;
  wandIndex: number;
  scalePx: number;
}

const CRACKLE_COUNT = 7;

/** Short, hot, hash-gated sparks continuously shed by a burning sparkler tip. */
export function crackleSparks(request: CrackleRequest): readonly SparkSpawn[] {
  const bucket = Math.floor(request.timeMs / 40);
  const sparks: SparkSpawn[] = [];
  for (let i = 0; i < CRACKLE_COUNT; i += 1) {
    const seed = request.wandIndex * 1009 + i * 37 + bucket * 131;
    const angle = (i / CRACKLE_COUNT) * Math.PI * 2 + (hash01(seed, 11) - 0.5) * 0.9;
    const speed = request.scalePx * (0.12 + hash01(seed, 23) * 0.38);
    sparks.push({
      x: request.tip.x,
      y: request.tip.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - request.scalePx * 0.025,
      k: 2.2 + hash01(seed, 29) * 1.7,
      g: request.scalePx * (0.32 + hash01(seed, 31) * 0.2),
      lifeMs: 280 + hash01(seed, 41) * 480,
      size: 1.5 + hash01(seed, 43) * 1.7,
      band: 0.05 + hash01(seed, 47) * 0.4,
      glitterRate: 10 + hash01(seed, 53) * 8,
      seed,
    });
  }
  return sparks;
}

export interface CollisionRequest {
  centre: PixelPoint;
  scalePx: number;
}

const COLLISION_PAIRS = 55;

/** Balanced radial crackle burst released when inward sparklers collide. */
export function collisionSparks(request: CollisionRequest): readonly SparkSpawn[] {
  const sparks: SparkSpawn[] = [];
  for (let pair = 0; pair < COLLISION_PAIRS; pair += 1) {
    const angle = (pair / COLLISION_PAIRS) * Math.PI;
    const speed = request.scalePx * 0.5 * (0.5 + hash01(pair, 1925) * 0.7);
    for (const sign of [1, -1] as const) {
      sparks.push({
        x: request.centre.x,
        y: request.centre.y,
        vx: Math.cos(angle) * speed * sign,
        vy: Math.sin(angle) * speed * sign,
        k: 1.8,
        g: request.scalePx * 0.17,
        lifeMs: 900,
        size: 2.6,
        band: 0.15,
        glitterRate: 12,
        seed: pair * 2 + (sign > 0 ? 0 : 1),
      });
    }
  }
  return sparks;
}
