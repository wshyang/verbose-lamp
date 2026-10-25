import { describe, expect, it } from 'vitest';
import { positionAt } from '../../particles/ballistics';
import { collisionSparks, crackleSparks, type CrackleRequest } from './sparkSpray';

const crackle = (overrides: Partial<CrackleRequest> = {}): CrackleRequest => ({
  tip: { x: 640, y: 360 },
  timeMs: 700,
  wandIndex: 1,
  scalePx: 720,
  ...overrides,
});

describe('crackleSparks', () => {
  it('emits seven deterministic, short-lived, glittering sparks from the burning tip', () => {
    const sparks = crackleSparks(crackle());

    expect(sparks).toEqual(crackleSparks(crackle()));
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
    const drooped = sparks.some((spark) => positionAt({ p0: spark.y, v0: spark.vy, k: spark.k, g: spark.g }, 0.45) > 360);
    expect(drooped).toBe(true);
  });

  it('throws the same spray for every frame inside one 40 ms bucket and a new one after', () => {
    expect(crackleSparks(crackle({ timeMs: 80 }))).toEqual(crackleSparks(crackle({ timeMs: 119 })));
    expect(crackleSparks(crackle({ timeMs: 80 }))).not.toEqual(crackleSparks(crackle({ timeMs: 120 })));
  });

  it('gives each wand its own spray', () => {
    expect(crackleSparks(crackle({ wandIndex: 0 }))).not.toEqual(crackleSparks(crackle({ wandIndex: 1 })));
  });

  // Hot sparks lift off the tip before gravity pulls them down, so the spray is biased a little
  // upward (negative y) rather than being a symmetric ring. Averaged over many frames the ring's
  // own contribution cancels, leaving only the lift.
  it('lifts the spray slightly, so its mean vertical velocity is upward', () => {
    const frames = Array.from({ length: 200 }, (_, i) => crackleSparks(crackle({ timeMs: i * 40 })));
    const all = frames.flat();
    const meanVy = all.reduce((sum, spark) => sum + spark.vy, 0) / all.length;
    const meanVx = all.reduce((sum, spark) => sum + spark.vx, 0) / all.length;

    expect(meanVy).toBeLessThan(-720 * 0.02);
    expect(Math.abs(meanVx)).toBeLessThan(Math.abs(meanVy));
  });

  it('fans the sparks all the way round the tip', () => {
    const quadrants = new Set(crackleSparks(crackle()).map((s) => `${Math.sign(s.vx)}${Math.sign(s.vy)}`));

    expect(quadrants.size).toBeGreaterThanOrEqual(3);
  });

  it('scales speed and gravity with the viewport', () => {
    const small = crackleSparks(crackle({ scalePx: 360 }));
    const large = crackleSparks(crackle({ scalePx: 720 }));

    expect(Math.hypot(large[0].vx, large[0].vy)).toBeGreaterThan(Math.hypot(small[0].vx, small[0].vy));
    expect(large[0].g).toBeCloseTo(small[0].g * 2, 6);
  });

  it('starts from wherever the tip is', () => {
    for (const spark of crackleSparks(crackle({ tip: { x: 12, y: 34 } }))) {
      expect([spark.x, spark.y]).toEqual([12, 34]);
    }
  });
});

describe('collisionSparks', () => {
  const centre = { x: 320, y: 180 };
  const burst = collisionSparks({ centre, scalePx: 720 });

  it('makes 110 sparks from the collision point', () => {
    expect(burst).toHaveLength(110);
    expect(burst.every((spark) => spark.x === 320 && spark.y === 180)).toBe(true);
  });

  // Every spark has an opposite of equal speed, so the burst has no net push: the flash does
  // not drift to one side. The looser bound the other PR used (under 140) would pass a lopsided one.
  it('is exactly balanced: the sparks sum to no net momentum', () => {
    const net = burst.reduce((sum, spark) => ({ x: sum.x + spark.vx, y: sum.y + spark.vy }), { x: 0, y: 0 });

    expect(net.x).toBeCloseTo(0, 6);
    expect(net.y).toBeCloseTo(0, 6);
  });

  it('pairs each spark with one flying the opposite way at the same speed', () => {
    for (let pair = 0; pair < burst.length; pair += 2) {
      expect(burst[pair].vx).toBeCloseTo(-burst[pair + 1].vx, 9);
      expect(burst[pair].vy).toBeCloseTo(-burst[pair + 1].vy, 9);
    }
  });

  it('covers the whole circle of headings', () => {
    // Exactly horizontal and vertical headings sign to 0, so test the four open quadrants.
    const quadrants = new Set(
      burst.filter((s) => s.vx !== 0 && s.vy !== 0).map((s) => `${Math.sign(s.vx)}${Math.sign(s.vy)}`)
    );

    expect([...quadrants].sort()).toEqual(['-1-1', '-11', '1-1', '11']);
  });

  it('gives every spark a unique seed, a nine-hundred-millisecond life and a glitter', () => {
    expect(new Set(burst.map((s) => s.seed)).size).toBe(110);
    expect(burst.every((s) => s.lifeMs === 900 && s.glitterRate >= 8)).toBe(true);
  });

  it('scales with the viewport and is repeatable', () => {
    const doubled = collisionSparks({ centre, scalePx: 1440 });

    expect(Math.hypot(doubled[0].vx, doubled[0].vy)).toBeCloseTo(2 * Math.hypot(burst[0].vx, burst[0].vy), 6);
    expect(collisionSparks({ centre, scalePx: 720 })).toEqual(burst);
  });
});
