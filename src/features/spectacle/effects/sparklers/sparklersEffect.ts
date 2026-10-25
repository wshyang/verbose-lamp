import { hash01 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { flashIntensityAt } from '../../model/motionPolicy';
import { clamp01, easeInQuad, easeOutCubic, quadBezier } from '../../model/timeline';
import type { NormPoint, SparklerTransitionParams } from '../../model/types';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import { sparklerBurstAt, sparklerEmissions } from './sparklerCrackle';
import { planSparklerCrossfade, planSparklerTransition, type SparklerPlan } from './sparklerPlan';

function drawFlash(plan: SparklerPlan, t: number, frame: FrameInfo): void {
  const level = flashIntensityAt(plan.flash, t) * frame.fade;
  if (level < 0.005) return;
  const { ctx, w, h } = frame;
  const cx = plan.origin.x * w;
  const cy = plan.origin.y * h;
  ctx.fillStyle = `rgba(255,246,220,${level * 0.9})`;
  ctx.fillRect(0, 0, w, h);
  const r = Math.max(w, h) * (0.3 + level);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, `rgba(255,255,250,${level})`);
  grad.addColorStop(0.5, `rgba(255,220,140,${level * 0.6})`);
  grad.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Anamorphic horizontal streak — the premiere lens-flare look.
  const streak = ctx.createLinearGradient(0, cy, w, cy);
  streak.addColorStop(0, 'rgba(255,235,180,0)');
  streak.addColorStop(0.5, `rgba(255,245,215,${level * 0.8})`);
  streak.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, cy - h * 0.035 * level, w, h * 0.07 * level);
}

interface SparklerHead {
  x: number;
  y: number;
  t: number;
  index: number;
}

/**
 * A party sparkler: a white-hot point, a small warm halo, and hairline
 * crackle sparks re-rolled every bucket by the pure crackle plan. No soft
 * fireball — sparklers spit, they do not billow (ADDENDUM-025).
 */
function drawSparklerHead(head: SparklerHead, frame: FrameInfo): void {
  const { x, y, t, index } = head;
  const { ctx, fade } = frame;
  const scale = Math.min(frame.w, frame.h) / 700;
  const burst = sparklerBurstAt({ seed: index * 17 + 5, tMs: t, scale });
  const halo = ctx.createRadialGradient(x, y, 0, x, y, burst.haloRadius);
  halo.addColorStop(0, `rgba(255,214,130,${0.55 * burst.flicker * fade})`);
  halo.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, burst.haloRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'round';
  for (const ray of burst.rays) {
    const tx = x + Math.cos(ray.angle) * ray.length;
    const ty = y + Math.sin(ray.angle) * ray.length;
    const spark = ctx.createLinearGradient(x, y, tx, ty);
    spark.addColorStop(0, `rgba(255,252,240,${ray.alpha * burst.flicker * fade})`);
    spark.addColorStop(0.55, `rgba(255,205,110,${ray.alpha * 0.75 * fade})`);
    spark.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.strokeStyle = spark;
    ctx.lineWidth = ray.width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,240,200,${ray.alpha * fade})`;
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(0.7, ray.width * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,254,248,${burst.flicker * fade})`;
  ctx.beginPath();
  ctx.arc(x, y, burst.coreRadius, 0, Math.PI * 2);
  ctx.fill();
}

function sparklerDirection(dx: number, dy: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}

function sparklerPosition(
  plan: SparklerPlan,
  trackIdx: number,
  t: number,
): { p: NormPoint; dx: number; dy: number } | null {
  const u = clamp01((t - plan.travelStartMs) / (plan.travelEndMs - plan.travelStartMs));
  if (t < plan.travelStartMs || t > plan.travelEndMs + 30) return null;
  const track = plan.tracks[trackIdx];
  const isOutward = plan.direction === 'outward';
  const e = isOutward ? easeInQuad(u) : easeOutCubic(u);
  const curve = {
    p0: isOutward ? plan.origin : track.target,
    p1: track.control,
    p2: isOutward ? track.target : plan.origin,
  };
  const p = quadBezier(curve, e);
  const q = quadBezier(curve, Math.min(1, e + 0.02));
  return { p, dx: q.x - p.x, dy: q.y - p.y };
}

function drawShockwave(plan: SparklerPlan, t: number, frame: FrameInfo): void {
  if (plan.collisionMs === null || t < plan.collisionMs) return;
  const u = (t - plan.collisionMs) / 650;
  if (u > 1) return;
  const { ctx, w, h, fade } = frame;
  const r = u * Math.min(w, h) * 0.75;
  ctx.globalAlpha = (1 - u) * fade;
  ctx.strokeStyle = 'rgba(255,220,140,0.9)';
  ctx.lineWidth = 10 * (1 - u) + 2;
  ctx.beginPath();
  ctx.arc(plan.origin.x * w, plan.origin.y * h, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

interface SparklerTick {
  plan: SparklerPlan;
  t: number;
  frame: FrameInfo;
  pool: ParticlePool;
}

function updateSparklers(tick: SparklerTick): void {
  const { plan, t, frame, pool } = tick;
  const scale = Math.min(frame.w, frame.h) / 700;
  for (let i = 0; i < plan.tracks.length; i += 1) {
    const pos = sparklerPosition(plan, i, t);
    if (!pos) continue;
    const x = pos.p.x * frame.w;
    const y = pos.p.y * frame.h;
    drawSparklerHead({ x, y, t, index: i }, frame);
    const dir = sparklerDirection(pos.dx, pos.dy);
    for (const spark of sparklerEmissions({ seed: i * 13 + 2, tMs: t, x, y, dirX: dir.x, dirY: dir.y, scale })) {
      pool.spawn(t, spark);
    }
  }
}

function fireCollisionSpray(tick: SparklerTick): void {
  const { plan, t, frame, pool } = tick;
  if (plan.collisionMs === null || t < plan.collisionMs) return;
  const cx = plan.origin.x * frame.w;
  const cy = plan.origin.y * frame.h;
  const speed = Math.min(frame.w, frame.h) * 0.5;
  for (let i = 0; i < 110; i += 1) {
    const a = (i / 110) * Math.PI * 2;
    const v = speed * (0.5 + hash01(i, 1925) * 0.7);
    pool.spawn(t, {
      x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      k: 1.8, g: 120, lifeMs: 900, size: 2.4, band: 0.15, glitterRate: 18, seed: i,
    });
  }
}

/**
 * Flying party sparklers with a white-out flash and collision spray — the
 * four transition configurations (sides/corners x outward/inward). Also
 * registered under the legacy 'orb-transition' id (ADDENDUM-025).
 */
export const sparklersEffect: EffectDefinition<SparklerTransitionParams> = {
  id: 'sparkler-transition',
  layer: 'light-overlay',
  create(ctx, params) {
    const plan = ctx.reducedMotion ? planSparklerCrossfade(params) : planSparklerTransition(params);
    const pool: ParticlePool = createParticlePool(700);
    const sprites: SpriteCache = createSpriteCache();
    let hasCovered = false;
    let hasSprayed = false;
    return {
      update(t, frame) {
        if (!hasCovered && t >= plan.onCoveredMs) {
          hasCovered = true;
          params.onCovered?.();
        }
        drawFlash(plan, t, frame);
        if (!plan.crossfade) {
          const tick: SparklerTick = { plan, t, frame, pool };
          updateSparklers(tick);
          if (!hasSprayed) fireCollisionSpray(tick);
          if (plan.collisionMs !== null && t >= plan.collisionMs) hasSprayed = true;
          drawShockwave(plan, t, frame);
        }
        pool.forEachAlive(t, (spark, age) =>
          drawSparkTrail(frame.ctx, sprites, { spark, ageMs: age, samples: 3, fade: frame.fade }),
        );
        return t > plan.durationMs + 500 ? 'done' : 'running';
      },
    };
  },
};
