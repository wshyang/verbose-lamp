// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSpriteCache, drawSparkTrail } from './sparkRenderer';
import { stubBrowserGlobals, unstubBrowserGlobals } from '../testing/recordingCanvas';

const spark = {
  x: 0.5, y: 0.5, vx: 0, vy: 0, k: 1, g: 0,
  lifeMs: 1000, size: 4, band: 2, glitterRate: 0, seed: 1, birthMs: 0,
};

function recordingCtx() {
  const drawn: unknown[] = [];
  const ctx = {
    globalAlpha: 1,
    drawImage: (sprite: unknown) => drawn.push(sprite),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawn };
}

beforeEach(() => {
  stubBrowserGlobals();
});

afterEach(() => {
  unstubBrowserGlobals();
});

describe('drawSparkTrail', () => {
  it('draws the emerald sprite for the green-light band', () => {
    const { ctx, drawn } = recordingCtx();
    let greenCalls = 0;
    const cache = createSpriteCache();
    drawSparkTrail(ctx, { ...cache, green: () => { greenCalls += 1; return cache.green(); } }, {
      spark,
      ageMs: 500,
      samples: 2,
      fade: 1,
    });
    expect(greenCalls).toBeGreaterThan(0);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('blits the blackbody band sprite for ordinary sparks', () => {
    const { ctx, drawn } = recordingCtx();
    drawSparkTrail(ctx, createSpriteCache(), { spark: { ...spark, band: 0.4 }, ageMs: 400, samples: 3, fade: 1 });
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('drops a trail whose keep-clear fade is zero', () => {
    const { ctx, drawn } = recordingCtx();
    drawSparkTrail(ctx, createSpriteCache(), {
      spark,
      ageMs: 500,
      samples: 2,
      fade: 1,
      keepClearFade: () => 0,
    });
    expect(drawn).toHaveLength(0);
  });
});
