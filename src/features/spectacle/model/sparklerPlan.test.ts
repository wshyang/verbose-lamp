import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPARKLER_SEED,
  isSparklerShowDone,
  planSparkler,
  planSparklerShow,
  sparklerEmissionRange,
  sparklerHeat,
  sparklerSpawn,
} from './sparklerPlan';

const ORIGIN = { x: 0.5, y: 0.6 } as const;

describe('planSparkler', () => {
  it('is deterministic for a seed', () => {
    expect(planSparkler({ origin: ORIGIN, seed: 1925 })).toEqual(planSparkler({ origin: ORIGIN, seed: 1925 }));
  });

  it('changes with the seed', () => {
    const a = planSparkler({ origin: ORIGIN, seed: 1925 });
    const b = planSparkler({ origin: ORIGIN, seed: 1926 });
    expect(a.sparks).not.toEqual(b.sparks);
  });

  it('defaults the seed and the duration', () => {
    const plan = planSparkler({ origin: ORIGIN });
    expect(plan.seed).toBe(DEFAULT_SPARKLER_SEED);
    expect(plan.durationMs).toBe(2600);
  });

  it('keeps every spark inside sane physical bounds', () => {
    const plan = planSparkler({ origin: ORIGIN, seed: 7 });
    expect(plan.sparks.length).toBeGreaterThan(100);
    for (const spark of plan.sparks) {
      expect(spark.angle).toBeGreaterThanOrEqual(0);
      expect(spark.angle).toBeLessThanOrEqual(Math.PI * 2);
      expect(spark.speed).toBeGreaterThan(0);
      expect(spark.lifeMs).toBeGreaterThan(0);
      expect(spark.glitterRate).toBeGreaterThan(0);
    }
  });

  it('scales density, head size and smoke with intensity', () => {
    const quiet = planSparkler({ origin: ORIGIN, intensity: 0 });
    const loud = planSparkler({ origin: ORIGIN, intensity: 1 });
    expect(loud.sparks.length).toBeGreaterThan(quiet.sparks.length);
    expect(loud.headRadius).toBeGreaterThan(quiet.headRadius);
    expect(loud.smoke).toBeGreaterThan(quiet.smoke);
    expect(loud.emissionRate).toBeGreaterThan(quiet.emissionRate);
  });

  it('clamps out-of-range intensity instead of throwing', () => {
    expect(planSparkler({ origin: ORIGIN, intensity: 4 }).emissionRate).toBe(
      planSparkler({ origin: ORIGIN, intensity: 1 }).emissionRate
    );
    expect(planSparkler({ origin: ORIGIN, intensity: -2 }).smoke).toBe(
      planSparkler({ origin: ORIGIN, intensity: 0 }).smoke
    );
  });
});

describe('planSparklerShow', () => {
  it('returns one plan by default', () => {
    expect(planSparklerShow({ origin: ORIGIN })).toHaveLength(1);
  });

  it('fans up to five sparklers, mirrored around the origin', () => {
    const show = planSparklerShow({ origin: ORIGIN, count: 5 });
    expect(show).toHaveLength(5);
    expect(show[0].origin.x).toBeLessThan(ORIGIN.x);
    expect(show[4].origin.x).toBeGreaterThan(ORIGIN.x);
    expect(show[0].origin.x + show[4].origin.x).toBeCloseTo(ORIGIN.x * 2, 6);
    expect(show[2].origin).toEqual(ORIGIN);
    expect(show[1].origin.x + show[3].origin.x).toBeCloseTo(ORIGIN.x * 2, 6);
  });

  // The outer sparklers sit a little higher than the centre, so a pair reads as held in two
  // hands and a five-fan as an arc. Mirrored, so the left and right rise by the same amount.
  it('raises the outer sparklers above the centre one, symmetrically', () => {
    const show = planSparklerShow({ origin: ORIGIN, count: 5 });

    expect(show[2].origin.y).toBe(ORIGIN.y);
    expect(show[1].origin.y).toBeGreaterThan(ORIGIN.y);
    expect(show[0].origin.y).toBeGreaterThan(show[1].origin.y);
    expect(show[0].origin.y).toBeCloseTo(show[4].origin.y, 9);
    expect(show[1].origin.y).toBeCloseTo(show[3].origin.y, 9);
  });

  it('clamps the count to 1..5', () => {
    expect(planSparklerShow({ origin: ORIGIN, count: 0 })).toHaveLength(1);
    expect(planSparklerShow({ origin: ORIGIN, count: 99 })).toHaveLength(5);
  });

  it('keeps the fan inside the viewport for an edge origin', () => {
    for (const plan of planSparklerShow({ origin: { x: 0.02, y: 0.98 }, count: 5 })) {
      expect(plan.origin.x).toBeGreaterThanOrEqual(0);
      expect(plan.origin.x).toBeLessThanOrEqual(1);
      expect(plan.origin.y).toBeGreaterThanOrEqual(0);
      expect(plan.origin.y).toBeLessThanOrEqual(1);
    }
  });

  it('gives every sparkler its own seed', () => {
    const seeds = planSparklerShow({ origin: ORIGIN, count: 3 }).map((plan) => plan.seed);
    expect(new Set(seeds).size).toBe(3);
  });
});

describe('sparklerHeat', () => {
  const plan = planSparkler({ origin: ORIGIN, seed: 3, durationMs: 1000 });

  it('is dark before ignition and after burnout', () => {
    expect(sparklerHeat(plan, -5)).toBe(0);
    expect(sparklerHeat(plan, 1001)).toBe(0);
  });

  it('strikes within the first 180 ms', () => {
    expect(sparklerHeat(plan, 0)).toBe(0);
    const early = sparklerHeat(plan, 60);
    const struck = sparklerHeat(plan, 200);
    expect(early).toBeGreaterThan(0);
    expect(struck).toBeGreaterThan(early);
  });

  it('fades over the last 620 ms', () => {
    const mid = sparklerHeat(plan, 300);
    const late = sparklerHeat(plan, 950);
    expect(late).toBeLessThan(mid);
    expect(sparklerHeat(plan, 999)).toBeLessThan(0.1);
  });

  it('holds full heat when there is no fade window', () => {
    const hardCut = { ...plan, fadeMs: 0, growMs: 1 };
    expect(sparklerHeat(hardCut, 500)).toBeGreaterThan(0.8);
  });

  it('always returns 0..1', () => {
    for (let t = 0; t <= 1000; t += 7) {
      const heat = sparklerHeat(plan, t);
      expect(heat).toBeGreaterThanOrEqual(0);
      expect(heat).toBeLessThanOrEqual(1);
    }
  });
});

describe('sparklerEmissionRange', () => {
  const plan = planSparkler({ origin: ORIGIN, seed: 11, durationMs: 1000, intensity: 1 });

  it('emits nothing for a zero-length or reversed window', () => {
    expect(sparklerEmissionRange(plan, 200, 200).count).toBe(0);
    expect(sparklerEmissionRange(plan, 300, 200).count).toBe(0);
  });

  it('is additive across a split window', () => {
    const whole = sparklerEmissionRange(plan, 0, 400);
    const first = sparklerEmissionRange(plan, 0, 150);
    const second = sparklerEmissionRange(plan, 150, 400);
    expect(first.count + second.count).toBe(whole.count);
    expect(second.start).toBe(first.start + first.count);
  });

  it('stops emitting after the plan ends', () => {
    const after = sparklerEmissionRange(plan, 1000, 2000);
    expect(after.count).toBe(0);
  });

  it('never emits a negative count', () => {
    expect(sparklerEmissionRange(plan, -50, 0).count).toBeGreaterThanOrEqual(0);
  });
});

describe('sparklerSpawn', () => {
  const plan = planSparkler({ origin: ORIGIN, seed: 5 });

  it('starts at the plan origin', () => {
    const spawn = sparklerSpawn(plan, 12);
    expect(spawn.x).toBe(ORIGIN.x);
    expect(spawn.y).toBe(ORIGIN.y);
  });

  it('carries the plan drag and gravity', () => {
    const spawn = sparklerSpawn(plan, 3);
    expect(spawn.k).toBe(plan.drag);
    expect(spawn.g).toBe(plan.gravity);
  });

  it('is deterministic and cycle-safe for negative indexes', () => {
    expect(sparklerSpawn(plan, 4)).toEqual(sparklerSpawn(plan, 4));
    expect(Number.isFinite(sparklerSpawn(plan, -1).vx)).toBe(true);
  });

  it('emits outward velocity matching its speed', () => {
    const spawn = sparklerSpawn(plan, 9);
    const speed = Math.hypot(spawn.vx, spawn.vy);
    expect(speed).toBeGreaterThan(0.1);
    expect(speed).toBeLessThan(0.5);
  });
});

describe('isSparklerShowDone', () => {
  it('is done only after every sparkler burns out', () => {
    const show = [planSparkler({ origin: ORIGIN, durationMs: 500 }), planSparkler({ origin: ORIGIN, durationMs: 900 })];
    expect(isSparklerShowDone(show, 600)).toBe(false);
    expect(isSparklerShowDone(show, 950)).toBe(true);
    expect(isSparklerShowDone([], 0)).toBe(true);
  });
});

// A caller can hand `play()` any number. A sparkler whose duration is NaN or infinite never
// finishes (its heat is NaN, or it burns forever), and the effect would hold a canvas and a
// particle pool for the life of the page. Bad durations fall back to the default; real ones are
// bounded.
const GROW_PLUS_FADE_MS = 180 + 620;

describe('planSparkler duration', () => {
  const origin = { x: 0.5, y: 0.5 };

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'treats %s as no duration and burns for the default',
    (durationMs) => {
      const plan = planSparkler({ origin, durationMs });

      expect(plan.durationMs).toBe(planSparkler({ origin }).durationMs);
      expect(Number.isFinite(sparklerHeat(plan, 500))).toBe(true);
    },
  );

  it('always lets a show finish', () => {
    const plans = planSparklerShow({ origin, count: 3, durationMs: Number.NaN });

    expect(isSparklerShowDone(plans, 60_000)).toBe(true);
  });

  it('keeps a real duration, bounded to something a canvas can hold', () => {
    expect(planSparkler({ origin, durationMs: 4000 }).durationMs).toBe(4000);
    // Shorter than the strike plus the fade, the head would never reach full heat before it fades.
    const floor = planSparkler({ origin, durationMs: -500 }).durationMs;
    expect(floor).toBe(GROW_PLUS_FADE_MS);
    expect(planSparkler({ origin, durationMs: floor - 1 }).durationMs).toBe(floor);
    expect(sparklerHeat(planSparkler({ origin, durationMs: 1 }), floor / 2)).toBeGreaterThan(0);
    expect(planSparkler({ origin, durationMs: 10 ** 9 }).durationMs).toBeLessThanOrEqual(30_000);
  });
});

