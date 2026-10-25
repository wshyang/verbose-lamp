// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRecordingContext, stubBrowserGlobals, unstubBrowserGlobals,
} from '../testing/recordingCanvas';
import { blackbodyColor } from './blackbody';
import { createSpriteCache, drawSparkTrail } from './sparkRenderer';

beforeEach(stubBrowserGlobals);
afterEach(unstubBrowserGlobals);

describe('particle branches', () => {
  it('returns the final blackbody stop for NaN and caches the green sprite', () => {
    expect(blackbodyColor(Number.NaN)).toEqual({ r: 0.74, g: 0.18, b: 0.05 });
    const cache = createSpriteCache();
    expect(cache.green()).toBe(cache.green());
  });

  it('draws a green-band spark through the green sprite', () => {
    const { ctx, log } = createRecordingContext();
    drawSparkTrail(ctx, createSpriteCache(), {
      spark: {
        x: 10, y: 10, vx: 0, vy: 0, k: 0, g: 0, lifeMs: 1000,
        size: 3, band: 2, glitterRate: 0, seed: 1, birthMs: 0,
      },
      ageMs: 10, samples: 1, fade: 1,
    });
    expect(log.some((entry) => entry.startsWith('drawImage('))).toBe(true);
  });
});
