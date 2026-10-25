import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { easeOutCubic } from '../../model/timeline';
import type { CountdownParams } from '../../model/types';
import { beatAt, planCountdown, type CountdownPlan } from './countdownPlan';

function drawRays(t: number, alpha: number, frame: FrameInfo): void {
  const { ctx, w, h } = frame;
  const cx = w / 2;
  const cy = h / 2;
  const reach = Math.max(w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 16; i += 1) {
    const a0 = t * 0.0003 + (i / 16) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(214,170,80,0.5)' : 'rgba(120,84,32,0.28)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, reach, a0, a0 + Math.PI / 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawNumeral(plan: CountdownPlan, value: number, local: number, reduced: boolean, frame: FrameInfo): void {
  const { ctx, w, h, fade } = frame;
  const beat = plan.beats[plan.beats.length - 1 - value];
  const reveal = easeOutCubic(Math.min(1, local / beat.revealMs));
  const exitU = Math.max(0, (local - (plan.beatMs - beat.exitMs)) / beat.exitMs);
  const scale = reduced ? 1 : (1.18 - 0.18 * reveal) * (1 + exitU * 0.55);
  const alpha = reveal * (1 - exitU) * fade;
  const size = Math.min(w, h) * 0.4 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px "Cinzel Decorative", Cinzel, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const sheen = Math.min(1, Math.max(0, local / plan.beatMs));
  const grad = ctx.createLinearGradient(w / 2 - size / 2, h / 2 - size / 2, w / 2 + size / 2, h / 2 + size / 2);
  grad.addColorStop(0, '#8a6428');
  grad.addColorStop(Math.max(0.01, sheen - 0.12), '#d9ab52');
  grad.addColorStop(Math.min(0.99, sheen), '#fff4cf');
  grad.addColorStop(Math.min(0.999, sheen + 0.12), '#d9ab52');
  grad.addColorStop(1, '#8a6428');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(255,214,130,0.55)';
  ctx.shadowBlur = 34;
  ctx.fillText(String(value), w / 2, h / 2);
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, size * 0.008);
  ctx.strokeStyle = 'rgba(58,38,10,0.8)';
  ctx.strokeText(String(value), w / 2, h / 2);
  ctx.restore();
}

/** Deco numerals with reveal, glint and scale-through exit, over a sunburst. */
export const countdownEffect: EffectDefinition<CountdownParams> = {
  id: 'countdown',
  layer: 'solid-overlay',
  create(ctx, params) {
    const plan = planCountdown(params.from ?? 5, params.beatMs ?? 900);
    let completed = false;
    return {
      update(t, frame) {
        const beat = beatAt(plan, t);
        if (beat) {
          const local = t - beat.startMs;
          drawRays(t, 0.3 * frame.fade * Math.min(1, local / 200), frame);
          drawNumeral(plan, beat.value, local, ctx.reducedMotion, frame);
        }
        if (!completed && t >= plan.totalMs) {
          completed = true;
          ctx.announce('Countdown complete');
          params.onComplete?.();
        }
        return t > plan.totalMs + 100 ? 'done' : 'running';
      },
    };
  },
};