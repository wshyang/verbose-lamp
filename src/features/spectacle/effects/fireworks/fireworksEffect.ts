import { hash01, mulberry32 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { pointInRect } from '../../model/geometry';
import { easeOutQuad, lerp } from '../../model/timeline';
import type { FireworksParams, FireworkShellType } from '../../model/types';
import { positionAt } from '../../particles/ballistics';
import { createParticlePool, type ParticlePool } from '../../particles/particlePool';
import { createSpriteCache, drawSparkTrail, type SpriteCache } from '../../particles/sparkRenderer';
import { shellRecipe, shellSparks } from './shells';
import { planShow, type ShellEvent } from './show';

interface Launch {
  ev: ShellEvent;
  startMs: number;
  burstMs: number;
  wobble: number;
  exploded: boolean;
}

interface Glow { x: number; y: number; bornMs: number; strength: number }
interface SubBurst { atMs: number; x: number; y: number; depth: number }

interface FwState {
  rng: () => number;
  pool: ParticlePool;
  sprites: SpriteCache;
  events: readonly ShellEvent[];
  cursor: number;
  offsetMs: number;
  cycle: number;
  launches: Launch[];
  glows: Glow[];
  subs: SubBurst[];
  params: FireworksParams;
  shellScale: number;
  durationMs: number;
}

function explodeShell(s: FwState, x: number, y: number, depth: number, type: FireworkShellType, t: number, minDim: number): void {
  const r = shellRecipe(type);
  const scale = s.shellScale * (0.75 + (1 - depth) * 0.45);
  const sparks = shellSparks(type, s.rng, scale, s.params.greenLight ?? false);
  s.glows.push({ x, y, bornMs: t, strength: 0.05 + (1 - depth) * 0.06 });
  for (const sp of sparks) {
    s.pool.spawn(t, {
      x, y,
      vx: sp.dx * sp.speed * minDim,
      vy: sp.dy * sp.speed * minDim,
      k: r.drag, g: r.gravity * minDim,
      lifeMs: sp.lifeS * 1000,
      size: sp.size * (minDim / 620),
      band: sp.green ? 2 : sp.band,
      glitterRate: sp.glitterRate,
      seed: Math.floor(s.rng() * 1e6),
    });
    if (sp.splits) {
      const ts = sp.lifeS * 0.55;
      s.subs.push({
        atMs: t + ts * 1000,
        x: positionAt({ p0: x, v0: sp.dx * sp.speed * minDim, k: r.drag, g: r.gravity * minDim }, ts),
        y: positionAt({ p0: y, v0: sp.dy * sp.speed * minDim, k: r.drag, g: r.gravity * minDim }, ts),
        depth: Math.min(1, depth + 0.25),
      });
    }
  }
}

function advanceSchedule(s: FwState, t: number, frame: FrameInfo): void {
  while (s.cursor < s.events.length) {
    const ev = s.events[s.cursor];
    const lead = 650 + ev.depth * 350;
    if (ev.tMs + s.offsetMs - lead > t) break;
    s.launches.push({
      ev, startMs: ev.tMs + s.offsetMs - lead, burstMs: ev.tMs + s.offsetMs,
      wobble: s.rng() * 10, exploded: false,
    });
    s.cursor += 1;
  }
  const minDim = Math.min(frame.w, frame.h);
  for (const l of s.launches) {
    if (!l.exploded && t >= l.burstMs) {
      l.exploded = true;
      explodeShell(s, l.ev.x * frame.w, l.ev.y * frame.h, l.ev.depth, l.ev.type, t, minDim);
    }
  }
  s.launches = s.launches.filter((l) => !l.exploded);
  for (let i = s.subs.length - 1; i >= 0; i -= 1) {
    if (t >= s.subs[i].atMs) {
      const sub = s.subs.splice(i, 1)[0];
      explodeShell(s, sub.x, sub.y, sub.depth, 'strobe', t, minDim * 0.4);
    }
  }
  const lastT = s.events.length ? s.events[s.events.length - 1].tMs : 0;
  if (s.params.continuous && s.cursor >= s.events.length && t > lastT + s.offsetMs + 2200) {
    s.cycle += 1;
    s.offsetMs = t + 500;
    s.cursor = 0;
    s.events = planShow({
      seed: (s.params.seed ?? 1925) + s.cycle, intensity: s.params.intensity,
      durationMs: s.durationMs, keepClear: s.params.keepClear,
      aspect: frame.w / Math.max(1, frame.h),
    });
  }
}

function drawCometsAndGlow(s: FwState, t: number, frame: FrameInfo): void {
  const { ctx, w, h, fade } = frame;
  for (let i = s.glows.length - 1; i >= 0; i -= 1) {
    const g = s.glows[i];
    const age = t - g.bornMs;
    if (age > 420) { s.glows.splice(i, 1); continue; }
    const a = g.strength * (1 - age / 420) * fade;
    const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, Math.max(w, h) * 0.7);
    grad.addColorStop(0, `rgba(255,214,140,${a})`);
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  for (const l of s.launches) {
    const u = Math.min(1, (t - l.startMs) / (l.burstMs - l.startMs));
    for (let j = 0; j < 5; j += 1) {
      const e = easeOutQuad(Math.max(0, u - j * 0.035));
      const x = lerp(l.ev.x + 0.02, l.ev.x, e) * w + Math.sin(e * 16 + l.wobble) * 3 * (1 - e);
      const y = lerp(1.05, l.ev.y, e) * h;
      const size = (5 - j * 0.7) * (Math.min(w, h) / 700);
      ctx.globalAlpha = (1 - j / 5) * 0.9 * fade;
      ctx.drawImage(s.sprites.get(0.12 + j * 0.08), x - size, y - size, size * 2, size * 2);
    }
  }
}

function drawSparks(s: FwState, t: number, frame: FrameInfo, trailSamples: number): void {
  const rects = s.params.keepClear ?? [];
  const keepClearFade = (x: number, y: number) => {
    const p = { x: x / frame.w, y: y / frame.h };
    return rects.some((r) => pointInRect(p, r)) ? 0.2 : 1;
  };
  s.pool.forEachAlive(t, (spark, age) => {
    if (spark.glitterRate > 0) {
      const gate = hash01(spark.seed, Math.floor((age / 1000) * spark.glitterRate));
      if (gate < 0.55) return;
    }
    drawSparkTrail(frame.ctx, s.sprites, spark, age, {
      samples: trailSamples, fade: frame.fade, keepClearFade,
    });
  });
}

/** Photoreal gold fireworks: comets, 3D shells, sky glow, afterimage trails. */
export const fireworksEffect: EffectDefinition<FireworksParams> = {
  id: 'fireworks',
  layer: 'light-backdrop',
  create(ctx, params) {
    const duration = params.durationMs ?? (params.finale ? 14000 : 12000);
    const s: FwState = {
      rng: mulberry32(params.seed ?? 1925),
      pool: createParticlePool(ctx.quality.sparkCap),
      sprites: createSpriteCache(),
      events: planShow({
        seed: params.seed ?? 1925, intensity: params.intensity, finale: params.finale,
        durationMs: duration, keepClear: params.keepClear,
        aspect: window.innerWidth / Math.max(1, window.innerHeight),
      }),
      cursor: 0, offsetMs: 0, cycle: 0, launches: [], glows: [], subs: [],
      params, shellScale: ctx.quality.shellScale, durationMs: duration,
    };
    const reduced = ctx.reducedMotion;
    let lastGlitter = 0;
    return {
      update(t, frame) {
        if (reduced) {
          if (t - lastGlitter > 500) {
            lastGlitter = t;
            s.pool.spawn(t, {
              x: s.rng() * frame.w, y: s.rng() * frame.h * 0.7,
              vx: 0, vy: 6, k: 0.5, g: 2, lifeMs: 2600,
              size: 2.2, band: 0.25, glitterRate: 0, seed: 1,
            });
          }
        } else {
          advanceSchedule(s, t, frame);
          drawCometsAndGlow(s, t, frame);
        }
        drawSparks(s, t, frame, reduced ? 2 : ctx.quality.trailSamples);
        const settled = t > s.offsetMs + s.durationMs + 5200 && s.pool.aliveCount(t) === 0;
        return !params.continuous && settled && s.launches.length === 0 ? 'done' : 'running';
      },
    };
  },
};