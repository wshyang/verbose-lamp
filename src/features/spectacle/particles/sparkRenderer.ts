import { positionAt } from './ballistics';
import { blackbodyColor, GREEN_LIGHT, rgbCss } from './blackbody';
import type { Spark } from './particlePool';

/** Pre-rendered radial sprites, one per blackbody band — cheap drawImage blits. */
export interface SpriteCache {
  get(band: number): HTMLCanvasElement;
  green(): HTMLCanvasElement;
}

function makeSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, rgbCss({ r, g, b }, 0.9));
  grad.addColorStop(0.6, rgbCss({ r, g, b }, 0.28));
  grad.addColorStop(1, rgbCss({ r, g, b }, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return c;
}

export function createSpriteCache(): SpriteCache {
  const bands = Array.from({ length: 24 }, (_, i) => {
    const c = blackbodyColor(i / 23);
    return makeSprite(c.r, c.g, c.b);
  });
  let greenSprite: HTMLCanvasElement | null = null;
  return {
    get(band) {
      const i = Math.min(23, Math.max(0, Math.round(band * 23)));
      return bands[i];
    },
    green() {
      if (!greenSprite) greenSprite = makeSprite(GREEN_LIGHT.r, GREEN_LIGHT.g, GREEN_LIGHT.b);
      return greenSprite;
    },
  };
}

export interface TrailRequest {
  spark: Spark;
  ageMs: number;
  samples: number;
  fade: number;
  keepClearFade?: (x: number, y: number) => number;
}

/** Long-exposure streak: the spark sampled at t, t−Δ, t−2Δ… */
export function drawSparkTrail(ctx: CanvasRenderingContext2D, cache: SpriteCache, request: TrailRequest): void {
  const { spark: s, ageMs, ...opts } = request;
  const t = ageMs / 1000;
  const lifeT = ageMs / s.lifeMs;
  const step = 0.018;
  for (let j = 0; j < opts.samples; j += 1) {
    const tj = t - j * step;
    if (tj < 0) break;
    const x = positionAt({ p0: s.x, v0: s.vx, k: s.k, g: s.g }, tj);
    const y = positionAt({ p0: s.y, v0: s.vy, k: s.k, g: s.g }, tj);
    const along = 1 - j / opts.samples;
    let alpha = along * along * (1 - lifeT * lifeT) * opts.fade;
    if (opts.keepClearFade) alpha *= opts.keepClearFade(x, y);
    if (alpha < 0.01) continue;
    const size = s.size * (0.5 + along * 0.5) * (j === 0 ? 1.6 : 1);
    const sprite = s.band > 1.5 ? cache.green() : cache.get(Math.min(1, lifeT + s.band));
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sprite, x - size, y - size, size * 2, size * 2);
  }
}