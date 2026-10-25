import { hash01 } from '@/shared/lib/random';
import type { EffectDefinition } from '../../engine/types';
import type { SparklerTransitionParams } from '../../model/types';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import { planOrbCrossfade, planOrbTransition, type OrbPlan } from '../orbs/orbPlan';
import { collisionSparks, crackleSparks } from './sparkSpray';
import { drawSparklerHead } from './sparklerRenderer';
import { drawSparklerWire } from './sparklerWire';
import { sparklerFlicker, wandGeometry } from './sparklerWand';
import { sparklerPose, type SparklerPose } from './transitionPose';
import { drawShockwave, drawTransitionFlash } from './transitionFlash';
import type { FrameInfo } from '../../engine/types';

/** Reference short side: art is authored for 700 px and scaled from there. */
const REFERENCE_UNIT_PX = 700;
const WAND_LENGTH_PX = 124;
const WAND_SWAY_PX = 8;
const HEAD_RADIUS_PX = 17;
const HEAD_RAYS = 18;
const POOL_CAP = 1400;
/** The transition's end: half a second past the plan so the last sparks can die. */
const TAIL_MS = 500;
const GLITTER_GATE = 0.3;
const MAX_TRAIL_SAMPLES = 4;

interface Tick {
  plan: OrbPlan;
  tMs: number;
  frame: FrameInfo;
  pool: ParticlePool;
}

interface SparklerDraw {
  pose: SparklerPose;
  index: number;
  tMs: number;
  frame: FrameInfo;
}

function drawSparkler({ pose, index, tMs, frame }: SparklerDraw): void {
  const scale = Math.min(frame.w, frame.h) / REFERENCE_UNIT_PX;
  const tip = { x: pose.point.x * frame.w, y: pose.point.y * frame.h };
  const geometry = wandGeometry({
    tip,
    direction: { x: pose.dx * frame.w, y: pose.dy * frame.h },
    lengthPx: WAND_LENGTH_PX * scale,
    burnProgress: 0.16 + pose.progress * 0.48,
    swayPx: Math.sin(tMs / 170 + index * 1.7) * WAND_SWAY_PX * scale,
  });
  drawSparklerWire({ ctx: frame.ctx, geometry, scale, fade: frame.fade });
  const seed = 1925 + index * 7919;
  const heat = Math.min(1, sparklerFlicker({ seed: index + 1, timeMs: tMs }) * 0.9);
  drawSparklerHead({
    ctx: frame.ctx, x: tip.x, y: tip.y, radius: HEAD_RADIUS_PX * scale * sparklerFlicker({ seed, timeMs: tMs }),
    heat, fade: frame.fade, seed, tMs, rayCount: HEAD_RAYS,
  });
}

function flySparklers({ plan, tMs, frame, pool }: Tick): void {
  const scalePx = Math.min(frame.w, frame.h);
  for (let index = 0; index < plan.tracks.length; index += 1) {
    const pose = sparklerPose(plan, index, tMs);
    if (!pose) continue;
    drawSparkler({ pose, index, tMs, frame });
    const tip = { x: pose.point.x * frame.w, y: pose.point.y * frame.h };
    for (const spark of crackleSparks({ tip, timeMs: tMs, wandIndex: index, scalePx })) pool.spawn(tMs, spark);
  }
}

function fireCollisionSpray({ plan, tMs, frame, pool }: Tick): void {
  if (plan.collisionMs === null || tMs < plan.collisionMs) return;
  const centre = { x: plan.origin.x * frame.w, y: plan.origin.y * frame.h };
  for (const spark of collisionSparks({ centre, scalePx: Math.min(frame.w, frame.h) })) pool.spawn(tMs, spark);
}

function drawSparks({ tMs, frame, pool }: Tick, sprites: SpriteCache, samples: number): void {
  pool.forEachAlive(tMs, (spark, ageMs) => {
    // Sparks glitter: each blinks off for a share of its life, by a seeded gate.
    if (hash01(spark.seed, Math.floor((ageMs / 1000) * spark.glitterRate)) < GLITTER_GATE) return;
    drawSparkTrail(frame.ctx, sprites, { spark, ageMs, samples, fade: frame.fade });
  });
}

/**
 * The sparkler transition (ADDENDUM-025/030): party sparklers fly the choreography the "orb" always
 * had, a wire behind a flickering head, shedding crackle, with a ring and a spray where they meet.
 * Reduced motion collapses to the flash crossfade with nothing flying. `onCovered` fires once, at
 * the planned cover point, whatever the mode.
 */
export const sparklerTransitionEffect: EffectDefinition<SparklerTransitionParams> = {
  id: 'sparkler-transition',
  layer: 'light-overlay',
  create(ctx, params) {
    const plan = ctx.reducedMotion ? planOrbCrossfade(params) : planOrbTransition(params);
    const pool: ParticlePool = createParticlePool(Math.min(ctx.quality.sparkCap, POOL_CAP));
    const sprites: SpriteCache = createSpriteCache();
    const samples = Math.min(MAX_TRAIL_SAMPLES, ctx.quality.trailSamples);
    let isCovered = false;
    let hasSprayed = false;

    return {
      update(tMs, frame) {
        if (!isCovered && tMs >= plan.onCoveredMs) {
          isCovered = true;
          params.onCovered?.();
        }
        drawTransitionFlash(plan, tMs, frame);
        const tick: Tick = { plan, tMs, frame, pool };
        if (!plan.crossfade) {
          flySparklers(tick);
          if (!hasSprayed) fireCollisionSpray(tick);
          if (plan.collisionMs !== null && tMs >= plan.collisionMs) hasSprayed = true;
          drawShockwave(plan, tMs, frame);
        }
        drawSparks(tick, sprites, samples);
        return tMs > plan.durationMs + TAIL_MS ? 'done' : 'running';
      },
    };
  },
};
