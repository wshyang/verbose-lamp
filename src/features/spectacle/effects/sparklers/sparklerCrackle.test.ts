import { describe, expect, it } from 'vitest';
import { sparklerBurstAt, sparklerEmissions } from './sparklerCrackle';

describe('sparklerBurstAt', () => {
  it('is deterministic for the same seed and crackle bucket', () => {
    const first = sparklerBurstAt({ seed: 3, tMs: 500, scale: 1.4 });
    expect(sparklerBurstAt({ seed: 3, tMs: 510, scale: 1.4 })).toEqual(first);
  });

  it('re-rolls the crackle in a later bucket', () => {
    const first = sparklerBurstAt({ seed: 3, tMs: 500, scale: 1 });
    expect(sparklerBurstAt({ seed: 3, tMs: 900, scale: 1 })).not.toEqual(first);
  });

  it('throws fine sparks in every direction, never flame tongues', () => {
    const burst = sparklerBurstAt({ seed: 1925, tMs: 1234, scale: 2 });
    expect(burst.rays.length).toBeGreaterThanOrEqual(12);
    expect(burst.rays.length).toBeLessThanOrEqual(18);
    for (const ray of burst.rays) {
      expect(ray.length).toBeGreaterThan(0);
      expect(ray.length).toBeLessThanOrEqual(36 * 2);
      expect(ray.width).toBeLessThanOrEqual(2.1 * 2);
      expect(ray.alpha).toBeGreaterThan(0);
      expect(ray.alpha).toBeLessThanOrEqual(1);
    }
    const sorted = [...burst.rays].sort((a, b) => a.angle - b.angle);
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i].angle - sorted[i - 1].angle);
    expect(maxGap).toBeLessThan(1.1);
  });

  it('scales the white-hot core and halo, and flickers between buckets', () => {
    const burst = sparklerBurstAt({ seed: 8, tMs: 0, scale: 2.5 });
    expect(burst.coreRadius).toBeCloseTo(8, 6);
    expect(burst.haloRadius).toBeCloseTo(37.5, 6);
    expect(burst.flicker).toBeGreaterThanOrEqual(0.7);
    expect(burst.flicker).toBeLessThanOrEqual(1);
  });

  it('treats a non-positive or non-finite scale as design scale', () => {
    expect(sparklerBurstAt({ seed: 1, tMs: 0, scale: 0 }).coreRadius).toBeCloseTo(3.2, 6);
    expect(sparklerBurstAt({ seed: 1, tMs: 0, scale: Number.NaN }).haloRadius).toBeCloseTo(15, 6);
  });
});

describe('sparklerEmissions', () => {
  const request = { seed: 4, tMs: 300, x: 120, y: 80, dirX: 1, dirY: 0, scale: 1.5 };

  it('sheds three glittering sparks from the head each frame', () => {
    const sparks = sparklerEmissions(request);
    expect(sparks).toHaveLength(3);
    for (const spark of sparks) {
      expect(spark.x).toBe(120);
      expect(spark.y).toBe(80);
      expect(spark.glitterRate).toBeGreaterThan(0);
      expect(spark.lifeMs).toBeGreaterThanOrEqual(420);
      expect(spark.lifeMs).toBeLessThan(680);
    }
  });

  it('is deterministic and biases sparks backwards into a trail', () => {
    expect(sparklerEmissions(request)).toEqual(sparklerEmissions(request));
    const meanVx = sparklerEmissions(request).reduce((sum, s) => sum + s.vx, 0) / 3;
    expect(meanVx).toBeLessThan(0);
  });

  it('falls back to design scale for a bad scale', () => {
    const sparks = sparklerEmissions({ ...request, scale: -2 });
    expect(sparks[0].size).toBeCloseTo(1.9, 6);
  });
});
