/**
 * Pure ring allocator over fixed spark slots (ADDENDUM-020 §3.2). Never
 * over-allocates; reuses the oldest slot first; reports drops when a live
 * spark is overwritten.
 */
export interface SparkSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  k: number;
  g: number;
  lifeMs: number;
  size: number;
  band: number;
  glitterRate: number;
  seed: number;
}

export interface Spark extends SparkSpawn {
  birthMs: number;
}

export interface ParticlePool {
  readonly capacity: number;
  readonly drops: number;
  spawn(nowMs: number, s: SparkSpawn): void;
  forEachAlive(nowMs: number, fn: (s: Spark, ageMs: number) => void): void;
  aliveCount(nowMs: number): number;
}

export function createParticlePool(capacity: number): ParticlePool {
  const slots: Spark[] = Array.from({ length: capacity }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, k: 0, g: 0,
    lifeMs: 0, size: 0, band: 0, glitterRate: 0, seed: 0, birthMs: -1e12,
  }));
  let cursor = 0;
  let drops = 0;

  const isAlive = (s: Spark, now: number) => now - s.birthMs < s.lifeMs;

  return {
    capacity,
    get drops() {
      return drops;
    },
    spawn(nowMs, s) {
      const slot = slots[cursor];
      if (isAlive(slot, nowMs)) drops += 1;
      Object.assign(slot, s, { birthMs: nowMs });
      cursor = (cursor + 1) % capacity;
    },
    forEachAlive(nowMs, fn) {
      for (const s of slots) {
        const age = nowMs - s.birthMs;
        if (age >= 0 && age < s.lifeMs) fn(s, age);
      }
    },
    aliveCount(nowMs) {
      let n = 0;
      for (const s of slots) if (isAlive(s, nowMs)) n += 1;
      return n;
    },
  };
}