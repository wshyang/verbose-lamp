// @vitest-environment jsdom
// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi } from 'vitest';

import { createSpriteCache, drawSparkTrail } from './sparkRenderer';

import { blackbodyColor, GREEN_LIGHT } from './blackbody';

import { type Spark } from './particlePool';

function spark_p4(overrides: Partial<Spark> = {}): Spark {
  return {
    x: 100,
    y: 100,
    vx: 0,
    vy: -40,
    k: 0.4,
    g: 120,
    lifeMs: 1_000,
    size: 3,
    band: 0,
    glitterRate: 0,
    seed: 1,
    birthMs: 0,
    ...overrides,
  };
}
/** The trail renderer only blits sprites, so a recording context is enough. */
function recordingContext() {
  const drawn: Array<{ alpha: number; size: number; image: HTMLCanvasElement }> = [];
  const ctx = {
    globalAlpha: 1,
    drawImage: (image: HTMLCanvasElement, _x: number, _y: number, w: number) => {
      drawn.push({ alpha: ctx.globalAlpha, size: w / 2, image });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, drawn };
}
describe('createSpriteCache', () => {
  it('pre-renders one sprite per blackbody band and clamps the band index', () => {
    const cache = createSpriteCache();
    const low = cache.get(-3);
    const high = cache.get(9);
    expect(low).toBeInstanceOf(HTMLCanvasElement);
    expect(cache.get(0.5)).toBe(cache.get(0.5));
    expect(high).toBe(cache.get(1));
    expect(cache.green()).toBe(cache.green());
  });

  it('gives the green light its own sprite', () => {
    const cache = createSpriteCache();
    expect(cache.green()).not.toBe(cache.get(0.5));
    expect(blackbodyColor(0.5).g).toBeLessThan(GREEN_LIGHT.g);
  });
});
describe('drawSparkTrail', () => {
  it('draws a fading streak that ends where the spark is now', () => {
    const cache = createSpriteCache();
    const { ctx, drawn } = recordingContext();
    drawSparkTrail(ctx, cache, { spark: spark_p4(), ageMs: 200, samples: 4, fade: 1 });

    expect(drawn.length).toBeGreaterThan(0);
    // The streak dims along its tail.
    expect(drawn[0].alpha).toBeGreaterThan(drawn[drawn.length - 1].alpha);
    // The head of the trail is drawn larger than the tail.
    expect(drawn[0].size).toBeGreaterThan(drawn[drawn.length - 1].size);
  });

  it('uses the green sprite for the green band and the banded sprite otherwise', () => {
    const cache = createSpriteCache();
    const green = recordingContext();
    drawSparkTrail(green.ctx, cache, { spark: spark_p4({ band: 2 }), ageMs: 100, samples: 2, fade: 1 });
    expect(new Set(green.drawn.map((entry) => entry.image)).size).toBe(1);
    expect(green.drawn[0].image).toBe(cache.green());
  });

  it('fades out with the keep-clear box and stops when invisible', () => {
    const cache = createSpriteCache();
    const visible = recordingContext();
    drawSparkTrail(visible.ctx, cache, {
      spark: spark_p4(),
      ageMs: 100,
      samples: 3,
      fade: 1,
      keepClearFade: () => 0.5,
    });
    expect(visible.drawn[0].alpha).toBeLessThanOrEqual(0.5);

    const hidden = recordingContext();
    drawSparkTrail(hidden.ctx, cache, {
      spark: spark_p4(),
      ageMs: 100,
      samples: 3,
      fade: 1,
      keepClearFade: () => 0.001,
    });
    expect(hidden.drawn).toHaveLength(0);
  });

  it('never draws a sample from before the spark was born', () => {
    const cache = createSpriteCache();
    const { ctx, drawn } = recordingContext();
    // 10 ms of age with an 18 ms sample step: only the head sample exists.
    drawSparkTrail(ctx, cache, { spark: spark_p4(), ageMs: 10, samples: 6, fade: 1 });
    expect(drawn).toHaveLength(1);
    expect(vi.isMockFunction(ctx.drawImage)).toBe(false);
  });
});
describe('blackbodyColor', () => {
  it('holds the ember colour past the end of the ramp', () => {
    expect(blackbodyColor(2)).toEqual(blackbodyColor(1));
    expect(blackbodyColor(-1)).toEqual(blackbodyColor(0));
  });
});
