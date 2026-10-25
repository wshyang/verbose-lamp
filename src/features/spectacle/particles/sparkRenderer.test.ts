// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRecordingContext } from '../testing/recordingCanvas';
import type { Spark } from './particlePool';
import { createSpriteCache, drawSparkTrail } from './sparkRenderer';

const SPARK: Spark = {
  x: 400, y: 300, vx: 10, vy: -20, k: 0.4, g: 30,
  lifeMs: 2000, size: 3, band: 0.2, glitterRate: 0, seed: 7, birthMs: 0,
};

describe('createSpriteCache', () => {
  it('builds the green-light sprite lazily and only once', () => {
    const cache = createSpriteCache();
    const green = cache.green();
    expect(green.width).toBe(32);
    expect(cache.green()).toBe(green);
  });
});

describe('drawSparkTrail', () => {
  it('samples the head larger than the streak behind it', () => {
    const { ctx, log } = createRecordingContext();
    drawSparkTrail(ctx, createSpriteCache(), { spark: SPARK, ageMs: 500, samples: 3, fade: 1 });
    const draws = log.filter((entry) => entry.startsWith('drawImage('));
    expect(draws.length).toBeGreaterThan(1);
  });
});
