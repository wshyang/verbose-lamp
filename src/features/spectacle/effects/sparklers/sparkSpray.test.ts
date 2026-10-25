import { describe, expect, it } from 'vitest';
import { positionAt } from '../../particles/ballistics';
import { collisionSparks, crackleSparks } from './sparkSpray';

describe('crackleSparks', () => {
  it('emits deterministic short-lived glittering sparks from the burning tip', () => {
    const request = {
      tip: { x: 640, y: 360 },
      timeMs: 700,
      wandIndex: 1,
      scalePx: 720,
    } as const;
    const sparks = crackleSparks(request);
    expect(sparks).toEqual(crackleSparks(request));
    expect(sparks).toHaveLength(7);
    for (const spark of sparks) {
      expect(spark.x).toBe(640);
      expect(spark.y).toBe(360);
      expect(spark.g).toBeGreaterThan(0);
      expect(spark.k).toBeGreaterThan(0);
      expect(spark.lifeMs).toBeGreaterThanOrEqual(280);
      expect(spark.lifeMs).toBeLessThanOrEqual(760);
      expect(spark.glitterRate).toBeGreaterThanOrEqual(10);
      expect(spark.band).toBeGreaterThanOrEqual(0);
      expect(spark.band).toBeLessThanOrEqual(0.45);
    }
    const drooped = sparks.some((spark) => (
      positionAt({ p0: spark.y, v0: spark.vy, k: spark.k, g: spark.g }, 0.45) > 360
    ));
    expect(drooped).toBe(true);
  });
});

describe('collisionSparks', () => {
  it('makes a balanced radial spray for the collision flash', () => {
    const sparks = collisionSparks({ centre: { x: 320, y: 180 }, scalePx: 720 });
    expect(sparks).toHaveLength(110);
    const net = sparks.reduce(
      (sum, spark) => ({ x: sum.x + spark.vx, y: sum.y + spark.vy }),
      { x: 0, y: 0 }
    );
    expect(Math.abs(net.x)).toBeLessThan(140);
    expect(Math.abs(net.y)).toBeLessThan(140);
    expect(sparks.every((spark) => spark.glitterRate >= 8)).toBe(true);
  });
});
