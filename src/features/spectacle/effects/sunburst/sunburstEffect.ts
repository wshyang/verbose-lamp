import type { EffectDefinition, FrameInfo } from '../../engine/types';
import type { SunburstWipeParams } from '../../model/types';
import { irisRadiusAt, planIris, type IrisPlan } from './irisPlan';

function drawWedges(plan: IrisPlan, radiusPx: number, t: number, frame: FrameInfo): void {
  const { ctx, w, h, fade } = frame;
  const cx = plan.origin.x * w;
  const cy = plan.origin.y * h;
  const rot = t * 0.0004;
  const span = plan.variant === 'fan' ? Math.PI : Math.PI * 2;
  const base = plan.variant === 'fan' ? Math.PI : 0;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, base, base + span);
  if (plan.variant === 'fan') ctx.closePath();
  ctx.clip();
  const reach = Math.max(w, h) * 2.2;
  for (let i = 0; i < plan.rays; i += 1) {
    const a0 = base + rot + (i / plan.rays) * span;
    const a1 = base + rot + ((i + 1) / plan.rays) * span;
    ctx.fillStyle = i % 2 === 0 ? '#c9a44e' : '#241708';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, reach, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  const sheen = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(60, radiusPx));
  sheen.addColorStop(0, 'rgba(255,244,205,0.95)');
  sheen.addColorStop(0.35, 'rgba(255,220,140,0.25)');
  sheen.addColorStop(1, 'rgba(20,12,4,0.35)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,232,170,0.8)';
  for (const f of [0.32, 0.62, 0.97]) {
    ctx.lineWidth = f > 0.9 ? 5 : 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx * f, base, base + span);
    ctx.stroke();
  }
  ctx.restore();
}

/** Deco sunburst iris wipe on the solid overlay, so the cover truly hides. */
export const sunburstEffect: EffectDefinition<SunburstWipeParams> = {
  id: 'sunburst-wipe',
  layer: 'solid-overlay',
  create(ctx, params) {
    const plan = planIris(params, ctx.reducedMotion);
    let coveredFired = false;
    return {
      update(t, frame) {
        if (!coveredFired && t >= plan.onCoveredMs) {
          coveredFired = true;
          params.onCovered?.();
        }
        if (plan.crossfade) {
          const u = t / plan.durationMs;
          const a = u < 0.5 ? u * 2 : (1 - u) * 2;
          frame.ctx.globalAlpha = a * 0.85 * frame.fade;
          frame.ctx.fillStyle = '#c9a44e';
          frame.ctx.fillRect(0, 0, frame.w, frame.h);
          frame.ctx.globalAlpha = 1;
        } else {
          const r = irisRadiusAt(plan, Math.min(t, plan.durationMs), frame.w / Math.max(1, frame.h));
          if (r > 1) drawWedges(plan, r * frame.h, t, frame);
        }
        return t > plan.durationMs ? 'done' : 'running';
      },
    };
  },
};