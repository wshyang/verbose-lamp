import { hash01 } from '@/shared/lib/random';
import type { EffectDefinition, FrameInfo } from '../../engine/types';
import { canRenderInDecoGlyphs } from '../../model/decoGlyphs';
import { easeOutCubic } from '../../model/timeline';
import type { NameRevealParams } from '../../model/types';

interface FontFit {
  text: string;
  maxWidth: number;
  baseSize: number;
  family: string;
}

function fitFont(ctx: CanvasRenderingContext2D, fit: FontFit): number {
  const { text, maxWidth, baseSize, family } = fit;
  let size = baseSize;
  ctx.font = `700 ${size}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && size > 18) {
    size *= 0.94;
    ctx.font = `700 ${size}px ${family}`;
  }
  return size;
}

interface RainSource {
  cx: number;
  cy: number;
  halfW: number;
}

function drawSparkRain(t: number, source: RainSource, frame: FrameInfo): void {
  const { cx, cy, halfW } = source;
  const { ctx, fade } = frame;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i += 1) {
    const speed = 0.05 + hash01(i, 7) * 0.1;
    const life = ((t / 1000) * speed + hash01(i, 13)) % 1;
    const x = cx + (hash01(i, 3) - 0.5) * halfW * 2.2;
    const y = cy - 60 + life * 190;
    const a = Math.sin(life * Math.PI) * 0.8 * fade;
    ctx.globalAlpha = a;
    ctx.fillStyle = i % 5 === 0 ? '#fff6d8' : '#eec36a';
    ctx.fillRect(x, y, 2, 2 + hash01(i, 5) * 3);
  }
  ctx.restore();
}

/** Gilded name with a glint sweep and spark rain; Cinzel fallback for any glyph. */
export const nameRevealEffect: EffectDefinition<NameRevealParams> = {
  id: 'name-reveal',
  layer: 'solid-overlay',
  create(ctx, params) {
    const duration = params.durationMs ?? 3400;
    const text = params.name.trim().toUpperCase();
    const family = canRenderInDecoGlyphs(text)
      ? '"Cinzel Decorative", Cinzel, Georgia, serif'
      : 'Cinzel, Georgia, serif';
    let announced = false;
    return {
      update(t, frame) {
        if (!announced && t > 350) {
          announced = true;
          ctx.announce(params.name);
        }
        const { ctx: c, w, h, fade } = frame;
        const appear = easeOutCubic(Math.min(1, t / 550));
        const out = Math.min(1, Math.max(0, (duration - t) / 500));
        const alpha = appear * out * fade;
        const size = fitFont(c, { text, maxWidth: w * 0.84, baseSize: Math.min(w, h) * 0.115, family });
        const cx = w / 2;
        const cy = h * 0.46 + (1 - appear) * 24;
        drawSparkRain(t, { cx, cy, halfW: size * text.length * 0.3 }, frame);
        c.save();
        c.globalAlpha = alpha;
        c.font = `700 ${size}px ${family}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const sheen = Math.min(1, Math.max(0, (t - 500) / 1700));
        const half = c.measureText(text).width / 2;
        const grad = c.createLinearGradient(cx - half, cy, cx + half, cy);
        grad.addColorStop(0, '#a87c33');
        grad.addColorStop(Math.max(0.01, sheen - 0.1), '#e8bd63');
        grad.addColorStop(Math.min(0.99, Math.max(0.02, sheen)), '#fff8dc');
        grad.addColorStop(Math.min(0.999, sheen + 0.1), '#e8bd63');
        grad.addColorStop(1, '#a87c33');
        c.fillStyle = grad;
        c.shadowColor = 'rgba(255,216,130,0.5)';
        c.shadowBlur = 26;
        c.fillText(text, cx, cy);
        c.shadowBlur = 0;
        if (params.subtitle) {
          c.font = `500 ${Math.max(13, size * 0.22)}px Jost, sans-serif`;
          c.fillStyle = 'rgba(238,214,160,0.9)';
          c.fillText(params.subtitle.toUpperCase(), cx, cy + size * 0.85);
        }
        c.restore();
        return t > duration ? 'done' : 'running';
      },
    };
  },
};