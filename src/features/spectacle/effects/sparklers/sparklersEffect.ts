import type { EffectDefinition, FrameInfo } from '../../engine/types';
import {
  isSparklerShowDone,
  planSparklerShow,
  sparklerEmissionRange,
  sparklerHeat,
  sparklerSpawn,
  type SparklerPlan,
} from '../../model/sparklerPlan';
import type { SparklerParams } from '../../model/types';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import { drawSparklerHead, drawSparklerSmoke, toPixelSpawn } from './sparklerRenderer';

/** Pool ceiling: sparklers are short-lived, so a sparse pool is honest. */
const MAX_POOL = 1400;
const SMOKE_ALPHA = 0.42;
const RAYS_FULL = 16;
/** Reduced motion keeps the warm head and drops the spray entirely. */
const RAYS_STILL = 0;

function emitForPlan(plan: SparklerPlan, fromMs: number, toMs: number, frame: FrameInfo, pool: ParticlePool): void {
  const range = sparklerEmissionRange(plan, fromMs, toMs);
  const limit = Math.min(range.count, pool.capacity);
  for (let i = 0; i < limit; i += 1) {
    pool.spawn(toMs, toPixelSpawn(sparklerSpawn(plan, range.start + i), frame));
  }
}

interface HeadRequest {
  plan: SparklerPlan;
  tMs: number;
  frame: FrameInfo;
  rayCount: number;
}

function drawHead({ plan, tMs, frame, rayCount }: HeadRequest): void {
  const heat = sparklerHeat(plan, tMs);
  if (heat <= 0.001) return;
  const unit = Math.min(frame.w, frame.h);
  const x = plan.origin.x * frame.w;
  const y = plan.origin.y * frame.h;
  const radius = Math.max(1.2, plan.headRadius * unit * (0.55 + heat * 0.65));
  drawSparklerSmoke(frame.ctx, x, y, radius, plan.smoke * heat * frame.fade * SMOKE_ALPHA);
  drawSparklerHead({ ctx: frame.ctx, x, y, radius, heat, fade: frame.fade, seed: plan.seed, tMs, rayCount });
}

interface EmissionRequest {
  plans: readonly SparklerPlan[];
  fromMs: number;
  toMs: number;
  frame: FrameInfo;
  pool: ParticlePool;
}

function emitShow({ plans, fromMs, toMs, frame, pool }: EmissionRequest): void {
  for (const plan of plans) emitForPlan(plan, fromMs, toMs, frame, pool);
}

/**
 * Party sparklers (ADDENDUM-025). A fan of 1–5 lit wires throwing crackling
 * sparks, warm halos and smoke; deterministic per seed and quality tier.
 * Reduced motion keeps the glow and drops the spray.
 */
export const sparklersEffect: EffectDefinition<SparklerParams> = {
  id: 'sparkler',
  layer: 'light-overlay',
  create(ctx, params) {
    const plans = planSparklerShow(params);
    const pool: ParticlePool = createParticlePool(Math.min(ctx.quality.sparkCap, MAX_POOL));
    const sprites: SpriteCache = createSpriteCache();
    const rayCount = ctx.reducedMotion ? RAYS_STILL : RAYS_FULL;
    let emittedUntil = 0;

    return {
      update(t, frame) {
        if (!ctx.reducedMotion && t > emittedUntil) {
          emitShow({ plans, fromMs: emittedUntil, toMs: t, frame, pool });
          emittedUntil = t;
        }
        for (const plan of plans) drawHead({ plan, tMs: t, frame, rayCount });
        pool.forEachAlive(t, (spark, ageMs) => {
          drawSparkTrail(frame.ctx, sprites, {
            spark, ageMs, samples: ctx.quality.trailSamples, fade: frame.fade,
          });
        });
        return isSparklerShowDone(plans, t) && pool.aliveCount(t) === 0 ? 'done' : 'running';
      },
    };
  },
};
