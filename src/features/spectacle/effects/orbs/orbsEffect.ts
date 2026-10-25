import { hash01 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { flashIntensityAt } from '../../model/motionPolicy';
import { clamp01, easeInQuad, easeOutCubic, quadBezier } from '../../model/timeline';
import type { NormPoint, OrbTransitionParams } from '../../model/types';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import { drawSparklerHead } from '../sparklers/sparklerRenderer';
import { planOrbCrossfade, planOrbTransition, type OrbPlan } from './orbPlan';

function drawFlash(plan: OrbPlan, t: number, frame: FrameInfo): void {
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

interface FireOrb {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  t: number;
  index: number;
}

/**
 * The flying "orb" is a party sparkler held at the travelling point: a
 * crackling head with a comet of sparks behind it (ADDENDUM-025 §3). The
 * transition choreography is unchanged — only the look of the head.
 */
function drawFireOrb(orb: FireOrb, frame: FrameInfo): void {
  const { x, y, dirX, dirY, t, index: idx } = orb;
  const { ctx, fade } = frame;
  const scale = Math.min(frame.w, frame.h) / 700;
  const back = Math.atan2(-dirY, -dirX);
  const seed = 1925 + idx * 7919;
  for (let i = 0; i < 6; i += 1) {
    const jitter = (hash01(seed + i, Math.floor(t / 60)) - 0.5) * 1.1;
    const len = (30 + hash01(i + seed, Math.floor(t / 90)) * 42) * scale;
    const a = back + jitter;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len;
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, `rgba(255,214,132,${0.58 * fade})`);
    g.addColorStop(1, 'rgba(220,80,20,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(0.8, (5 - i * 0.7) * scale);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }
  const heat = 0.82 + hash01(seed, Math.floor(t / 50)) * 0.18;
  drawSparklerHead({ ctx, x, y, radius: 17 * scale, heat, fade, seed, tMs: t, rayCount: 18 });
}

function orbPosition(plan: OrbPlan, trackIdx: number, t: number): { p: NormPoint; dx: number; dy: number } | null {
  const u = clamp01((t - plan.travelStartMs) / (plan.travelEndMs - plan.travelStartMs));
  if (t < plan.travelStartMs || t > plan.travelEndMs + 30) return null;
  const track = plan.tracks[trackIdx];
  const outward = plan.direction === 'outward';
  const e = outward ? easeInQuad(u) : easeOutCubic(u);
  const from = outward ? plan.origin : track.target;
  const to = outward ? track.target : plan.origin;
  const curve = { p0: from, p1: track.control, p2: to };
  const p = quadBezier(curve, e);
  const q = quadBezier(curve, Math.min(1, e + 0.02));
  return { p, dx: q.x - p.x, dy: q.y - p.y };
}

function drawShockwave(plan: OrbPlan, t: number, frame: FrameInfo): void {
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

/** Fiery gold orbs, white-out flash, collision shockwave — four configurations. */
export const orbsEffect: EffectDefinition<OrbTransitionParams> = {
  id: 'orb-transition',
  layer: 'light-overlay',
  create(ctx, params) {
    const plan = ctx.reducedMotion ? planOrbCrossfade(params) : planOrbTransition(params);
    const pool: ParticlePool = createParticlePool(700);
    const sprites: SpriteCache = createSpriteCache();
    let coveredFired = false;
    let sprayFired = false;
    return {
      update(t, frame) {
        if (!coveredFired && t >= plan.onCoveredMs) {
          coveredFired = true;
          params.onCovered?.();
        }
        drawFlash(plan, t, frame);
        if (!plan.crossfade) {
          const tick: OrbTick = { plan, t, frame, pool };
          updateOrbs(tick);
          if (!sprayFired) fireCollisionSpray(tick);
          if (plan.collisionMs !== null && t >= plan.collisionMs) sprayFired = true;
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

interface OrbTick {
  plan: OrbPlan;
  t: number;
  frame: FrameInfo;
  pool: ParticlePool;
}

function updateOrbs(tick: OrbTick): void {
  const { plan, t, frame, pool } = tick;
  for (let i = 0; i < plan.tracks.length; i += 1) {
    const pos = orbPosition(plan, i, t);
    if (!pos) continue;
    const x = pos.p.x * frame.w;
    const y = pos.p.y * frame.h;
    drawFireOrb({ x, y, dirX: pos.dx, dirY: pos.dy, t, index: i }, frame);
    for (let j = 0; j < 2; j += 1) {
      pool.spawn(t, {
        x, y,
        vx: -pos.dx * frame.w * 12 + (hash01(i, t + j) - 0.5) * 60,
        vy: -pos.dy * frame.h * 12 + (hash01(j, t + i) - 0.5) * 60,
        k: 2, g: 60, lifeMs: 650, size: 2.4, band: 0.3, glitterRate: 0, seed: i * 7 + j,
      });
    }
  }
}

function fireCollisionSpray(tick: OrbTick): void {
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
      k: 1.8, g: 120, lifeMs: 900, size: 2.6, band: 0.15, glitterRate: 0, seed: i,
    });
  }
}