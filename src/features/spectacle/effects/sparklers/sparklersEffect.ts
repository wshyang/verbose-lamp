import { hash01 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { flashIntensityAt } from '../../model/motionPolicy';
import { clamp01, easeInQuad, easeOutCubic, quadBezier } from '../../model/timeline';
import type { NormPoint, SparklerTransitionParams } from '../../model/types';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import {
  planSparklerCrossfade,
  planSparklerTransition,
  type SparklerPlan,
} from './sparklerPlan';
import { collisionSparks, crackleSparks } from './sparkSpray';
import { sparklerFlicker, wandGeometry } from './sparklerWand';

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
  const streak = ctx.createLinearGradient(0, cy, w, cy);
  streak.addColorStop(0, 'rgba(255,235,180,0)');
  streak.addColorStop(0.5, `rgba(255,245,215,${level * 0.8})`);
  streak.addColorStop(1, 'rgba(255,235,180,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, cy - h * 0.035 * level, w, h * 0.07 * level);
}

interface WandPose {
  point: NormPoint;
  dx: number;
  dy: number;
  progress: number;
}

function wandPose(plan: SparklerPlan, trackIdx: number, t: number): WandPose | null {
  if (t < plan.travelStartMs || t > plan.travelEndMs + 30) return null;
  const u = clamp01((t - plan.travelStartMs) / (plan.travelEndMs - plan.travelStartMs));
  const track = plan.tracks[trackIdx];
  const outward = plan.direction === 'outward';
  const eased = outward ? easeInQuad(u) : easeOutCubic(u);
  const curve = {
    p0: outward ? plan.origin : track.target,
    p1: track.control,
    p2: outward ? track.target : plan.origin,
  };
  const point = quadBezier(curve, eased);
  const ahead = quadBezier(curve, Math.min(1, eased + 0.02));
  return { point, dx: ahead.x - point.x, dy: ahead.y - point.y, progress: u };
}

interface WandDraw {
  pose: WandPose;
  frame: FrameInfo;
  timeMs: number;
  index: number;
}

function drawWire(draw: WandDraw, geometry: ReturnType<typeof wandGeometry>, scale: number): void {
  const { ctx, fade } = draw.frame;
  ctx.lineCap = 'round';
  ctx.strokeStyle = `rgba(42,38,34,${0.94 * fade})`;
  ctx.lineWidth = Math.max(2, 3.2 * scale);
  ctx.beginPath();
  ctx.moveTo(geometry.handle.x, geometry.handle.y);
  ctx.lineTo(geometry.burnFront.x, geometry.burnFront.y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(218,211,196,${0.62 * fade})`;
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(geometry.handle.x, geometry.handle.y - scale);
  ctx.lineTo(geometry.burnFront.x, geometry.burnFront.y - scale);
  ctx.stroke();

  const coating = ctx.createLinearGradient(
    geometry.burnFront.x, geometry.burnFront.y, geometry.tip.x, geometry.tip.y
  );
  coating.addColorStop(0, `rgba(74,42,24,${0.95 * fade})`);
  coating.addColorStop(0.72, `rgba(190,82,24,${0.96 * fade})`);
  coating.addColorStop(1, `rgba(255,205,105,${fade})`);
  ctx.strokeStyle = coating;
  ctx.lineWidth = Math.max(3, 5 * scale);
  ctx.beginPath();
  ctx.moveTo(geometry.burnFront.x, geometry.burnFront.y);
  ctx.lineTo(geometry.tip.x, geometry.tip.y);
  ctx.stroke();
}

function drawBurningTip(draw: WandDraw, scale: number, flicker: number): void {
  const { ctx, fade } = draw.frame;
  const x = draw.pose.point.x * draw.frame.w;
  const y = draw.pose.point.y * draw.frame.h;
  for (const [radius, color] of [
    [44, `rgba(255,122,28,${0.34 * fade})`],
    [24, `rgba(255,190,78,${0.82 * fade})`],
    [10, `rgba(255,253,242,${fade})`],
  ] as const) {
    const r = radius * scale * flicker;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,122,28,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const angle = hash01(draw.index * 97 + 5, Math.floor(draw.timeMs / 70)) * Math.PI;
  ctx.strokeStyle = `rgba(255,244,205,${0.82 * fade})`;
  ctx.lineWidth = Math.max(1, 1.4 * scale);
  for (const turn of [0, Math.PI / 2]) {
    const dx = Math.cos(angle + turn) * 30 * scale * flicker;
    const dy = Math.sin(angle + turn) * 30 * scale * flicker;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }
}

function drawSparklerWand(draw: WandDraw): void {
  const { frame, pose, timeMs, index } = draw;
  const scale = Math.min(frame.w, frame.h) / 700;
  const tip = { x: pose.point.x * frame.w, y: pose.point.y * frame.h };
  const geometry = wandGeometry({
    tip,
    direction: { x: pose.dx * frame.w, y: pose.dy * frame.h },
    lengthPx: 124 * scale,
    burnProgress: 0.16 + pose.progress * 0.48,
    swayPx: Math.sin(timeMs / 170 + index * 1.7) * 8 * scale,
  });
  drawWire(draw, geometry, scale);
  drawBurningTip(draw, scale, sparklerFlicker({ seed: index + 1, timeMs }));
}

function drawShockwave(plan: SparklerPlan, t: number, frame: FrameInfo): void {
  if (plan.collisionMs === null || t < plan.collisionMs) return;
  const u = (t - plan.collisionMs) / 650;
  if (u > 1) return;
  const { ctx, w, h, fade } = frame;
  ctx.globalAlpha = (1 - u) * fade;
  ctx.strokeStyle = 'rgba(255,220,140,0.9)';
  ctx.lineWidth = 10 * (1 - u) + 2;
  ctx.beginPath();
  ctx.arc(plan.origin.x * w, plan.origin.y * h, u * Math.min(w, h) * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

interface SparklerTick {
  plan: SparklerPlan;
  timeMs: number;
  frame: FrameInfo;
  pool: ParticlePool;
}

function updateWands(tick: SparklerTick): void {
  const { plan, timeMs, frame, pool } = tick;
  for (let i = 0; i < plan.tracks.length; i += 1) {
    const pose = wandPose(plan, i, timeMs);
    if (!pose) continue;
    drawSparklerWand({ pose, frame, timeMs, index: i });
    const sparks = crackleSparks({
      tip: { x: pose.point.x * frame.w, y: pose.point.y * frame.h },
      timeMs,
      wandIndex: i,
      scalePx: Math.min(frame.w, frame.h),
    });
    for (const spark of sparks) pool.spawn(timeMs, spark);
  }
}

function fireCollisionSpray(tick: SparklerTick): void {
  const { plan, timeMs, frame, pool } = tick;
  if (plan.collisionMs === null || timeMs < plan.collisionMs) return;
  const sparks = collisionSparks({
    centre: { x: plan.origin.x * frame.w, y: plan.origin.y * frame.h },
    scalePx: Math.min(frame.w, frame.h),
  });
  for (const spark of sparks) pool.spawn(timeMs, spark);
}

function drawPool(tick: SparklerTick, sprites: SpriteCache, samples: number): void {
  tick.pool.forEachAlive(tick.timeMs, (spark, ageMs) => {
    // Every crackle/collision spawn carries a positive glitter rate.
    const gate = hash01(spark.seed, Math.floor((ageMs / 1000) * spark.glitterRate));
    if (gate < 0.3) return;
    drawSparkTrail(tick.frame.ctx, sprites, {
      spark,
      ageMs,
      samples,
      fade: tick.frame.fade,
    });
  });
}

function createSparklersEffect(id: string): EffectDefinition<SparklerTransitionParams> {
  return {
    id,
    layer: 'light-overlay',
    create(ctx, params) {
      const plan = ctx.reducedMotion ? planSparklerCrossfade(params) : planSparklerTransition(params);
      const pool = createParticlePool(ctx.quality.sparkCap);
      const sprites = createSpriteCache();
      let coveredFired = false;
      let sprayFired = false;
      return {
        update(timeMs, frame) {
          if (!coveredFired && timeMs >= plan.onCoveredMs) {
            coveredFired = true;
            params.onCovered?.();
          }
          drawFlash(plan, timeMs, frame);
          const tick = { plan, timeMs, frame, pool };
          if (!plan.crossfade) {
            updateWands(tick);
            if (!sprayFired) fireCollisionSpray(tick);
            if (plan.collisionMs !== null && timeMs >= plan.collisionMs) sprayFired = true;
            drawShockwave(plan, timeMs, frame);
          }
          drawPool(tick, sprites, Math.min(4, ctx.quality.trailSamples));
          return timeMs > plan.durationMs + 500 ? 'done' : 'running';
        },
      };
    },
  };
}

/** Party sparklers on the four transition tracks: wire, burning tip, crackle, flash. */
export const sparklersEffect = createSparklersEffect('sparkler-transition');

/** @deprecated Use `sparklersEffect`; the old id remains a typed registry alias. */
export const orbsEffect = createSparklersEffect('orb-transition');
