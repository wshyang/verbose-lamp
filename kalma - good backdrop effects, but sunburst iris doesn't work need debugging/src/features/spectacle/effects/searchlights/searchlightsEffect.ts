import type { EffectDefinition } from '../../engine/types';
import type { NormRect, SearchlightParams } from '../../model/types';
import { beamAngleAt, planSearchlights, type SearchlightBeam } from './searchlightPlan';

function drawBeam(
  ctx: CanvasRenderingContext2D,
  beam: SearchlightBeam,
  tSec: number,
  w: number,
  h: number,
  fade: number,
): void {
  const angle = beamAngleAt(beam, tSec, 0);
  const ox = beam.baseX * w;
  const oy = h * 1.05;
  const len = h * 1.35;
  for (const [spread, alpha] of [[0.05, 0.16], [0.11, 0.05]] as const) {
    const x1 = ox + Math.cos(angle - spread) * len;
    const y1 = oy + Math.sin(angle - spread) * len;
    const x2 = ox + Math.cos(angle + spread) * len;
    const y2 = oy + Math.sin(angle + spread) * len;
    const grad = ctx.createLinearGradient(ox, oy, ox + Math.cos(angle) * len, oy + Math.sin(angle) * len);
    grad.addColorStop(0, `rgba(255,232,170,${alpha * fade})`);
    grad.addColorStop(1, 'rgba(255,232,170,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
}

function dimKeepClear(
  ctx: CanvasRenderingContext2D,
  rects: readonly NormRect[],
  w: number,
  h: number,
): void {
  if (rects.length === 0) return;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const r of rects) ctx.fillRect(r.x * w, r.y * h, r.w * w, r.h * h);
  ctx.globalCompositeOperation = 'lighter';
}

/** Volumetric sweep cones from below the screen edge, additive and hazy. */
export const searchlightsEffect: EffectDefinition<SearchlightParams> = {
  id: 'searchlights',
  layer: 'light-backdrop',
  create(ctx, params) {
    const beams = planSearchlights(params.beams ?? 3, params.seed ?? 1925);
    const keepClear = params.keepClear ?? [];
    const speedScale = ctx.reducedMotion ? 0.25 : 1;
    return {
      update(t, { ctx: c, w, h, fade }) {
        for (const beam of beams) drawBeam(c, beam, (t / 1000) * speedScale, w, h, fade);
        dimKeepClear(c, keepClear, w, h);
        return 'running';
      },
    };
  },
};