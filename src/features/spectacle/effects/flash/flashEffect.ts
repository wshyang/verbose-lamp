import type { EffectDefinition } from '../../engine/types';
import { flashIntensityAt, sanitizeFlashPlan } from '../../model/motionPolicy';
import type { FlashParams } from '../../model/types';

/** Trivial pipeline-proof effect (ADDENDUM-020 phase 1): one guarded flash. */
export const flashEffect: EffectDefinition<FlashParams> = {
  id: 'flash',
  layer: 'light-overlay',
  create(_ctx, params) {
    const plan = sanitizeFlashPlan([
      { startMs: 0, attackMs: 100, holdMs: 120, decayMs: 450, peak: 0.9 },
    ]);
    const duration = params.durationMs ?? 700;
    const origin = params.origin ?? { x: 0.5, y: 0.45 };
    return {
      update(t, { ctx, w, h, fade }) {
        const level = flashIntensityAt(plan, t) * fade;
        if (level > 0.005) {
          const cx = origin.x * w;
          const cy = origin.y * h;
          const r = Math.max(w, h) * (0.35 + level * 0.8);
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, `rgba(255,250,235,${level})`);
          grad.addColorStop(0.4, `rgba(255,222,150,${level * 0.7})`);
          grad.addColorStop(1, 'rgba(255,200,110,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        }
        return t > duration ? 'done' : 'running';
      },
    };
  },
};