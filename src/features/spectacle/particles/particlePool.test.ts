import { describe, expect, it } from 'vitest';
import { createParticlePool, type SparkSpawn } from './particlePool';

const spark: SparkSpawn = {
  x: 0.5, y: 0.3, vx: 0.1, vy: -0.2, k: 1, g: 0.3,
  lifeMs: 1000, size: 3, band: 0.2, glitterRate: 0, seed: 1925,
};

describe('particlePool', () => {
  it('never allocates beyond capacity', () => {
    const pool = createParticlePool(4);
    for (let i = 0; i < 40; i += 1) pool.spawn(i, spark);
    expect(pool.aliveCount(40)).toBeLessThanOrEqual(4);
  });

  it('reuses expired slots without counting drops', () => {
    const pool = createParticlePool(2);
    pool.spawn(0, spark);
    pool.spawn(0, spark);
    pool.spawn(1500, spark);
    pool.spawn(1500, spark);
    expect(pool.drops).toBe(0);
    expect(pool.aliveCount(1500)).toBe(2);
  });

  it('reports drops when overwriting live sparks', () => {
    const pool = createParticlePool(2);
    pool.spawn(0, spark);
    pool.spawn(0, spark);
    pool.spawn(10, spark);
    expect(pool.drops).toBe(1);
  });

  it('expires sparks after their life', () => {
    const pool = createParticlePool(2);
    pool.spawn(0, spark);
    expect(pool.aliveCount(999)).toBe(1);
    expect(pool.aliveCount(1001)).toBe(0);
  });
});