import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DURATION_MS,
  MAX_STICKS,
  burningSticks,
  isSparklerShowDone,
  planSparklerStill,
  planSparklers,
  resolveStickCount,
  sparkleField,
  sparklerIntensity,
  sparklerTip,
} from './sparklerPlan';

const ORIGIN = { x: 0.5, y: 0.66 } as const;

describe('resolveStickCount', () => {
  it('defaults, clamps and rounds', () => {
    expect(resolveStickCount(undefined)).toBe(3);
    expect(resolveStickCount(Number.NaN)).toBe(3);
    expect(resolveStickCount(0)).toBe(1);
    expect(resolveStickCount(99)).toBe(MAX_STICKS);
    expect(resolveStickCount(2.6)).toBe(3);
  });
});

describe('planSparklers', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = planSparklers({ seed: 1925 });
    const b = planSparklers({ seed: 1925 });
    const c = planSparklers({ seed: 1926 });
    expect(a).toEqual(b);
    expect(a.sticks[0].tilt).not.toBe(c.sticks[0].tilt);
  });

  it('fans the sticks across the spread, furthest-left first', () => {
    const plan = planSparklers({ count: 3, origin: ORIGIN, spread: 0.15 });
    const xs = plan.sticks.map((stick) => stick.anchor.x);
    expect(xs).toHaveLength(3);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[0]).toBeCloseTo(ORIGIN.x - 0.15, 6);
    expect(xs[2]).toBeCloseTo(ORIGIN.x + 0.15, 6);
  });

  it('plants a single stick dead centre with no lean from the fan', () => {
    const plan = planSparklers({ count: 1, origin: ORIGIN });
    expect(plan.sticks[0].anchor.x).toBe(ORIGIN.x);
    expect(Math.abs(plan.sticks[0].tilt)).toBeLessThan(0.07);
  });

  it('staggers ignition and keeps the last stick alight before the end', () => {
    const plan = planSparklers({ durationMs: 3000 });
    expect(plan.sticks[0].burnStartMs).toBe(0);
    expect(plan.sticks[2].burnStartMs).toBe(180);
    expect(plan.durationMs).toBe(3000);
    expect(plan.sticks.every((stick) => stick.burnEndMs < plan.durationMs)).toBe(true);
  });

  it('falls back to the documented defaults', () => {
    const plan = planSparklers();
    expect(plan.durationMs).toBe(DEFAULT_DURATION_MS);
    expect(plan.sticks).toHaveLength(3);
    expect(plan.still).toBe(false);
    expect(plan.origin).toEqual(ORIGIN);
  });

  it('stands the fan still for reduced motion', () => {
    const plan = planSparklerStill({ count: 4 });
    expect(plan.still).toBe(true);
    expect(plan.sticks.every((stick) => stick.swayRate === 0)).toBe(true);
  });
});

describe('sparklerTip', () => {
  it('sits one wire length above the anchor when vertical', () => {
    const plan = planSparklers({ count: 1, origin: ORIGIN });
    const stick = { ...plan.sticks[0], tilt: 0, swayRate: 0, length: 0.3 };
    expect(sparklerTip(stick, 500)).toEqual({ x: ORIGIN.x, y: ORIGIN.y - 0.3 });
  });

  it('leans with the tilt and always stays above the anchor', () => {
    const stick = { ...planSparklers().sticks[0], tilt: 0.4, swayRate: 0, length: 0.3 };
    const tip = sparklerTip(stick, 0);
    expect(tip.x).toBeGreaterThan(stick.anchor.x);
    expect(tip.y).toBeLessThan(stick.anchor.y);
  });

  it('sways over time, and not at all when still', () => {
    const stick = planSparklers({ seed: 7 }).sticks[0];
    const moving = [0, 400, 800].map((t) => sparklerTip(stick, t).x);
    expect(new Set(moving).size).toBe(3);

    const still = planSparklerStill({ seed: 7 }).sticks[0];
    expect(sparklerTip(still, 0).x).toBe(sparklerTip(still, 800).x);
  });
});

describe('sparklerIntensity', () => {
  const stick = planSparklers({ durationMs: 2000 }).sticks[0];

  it('is dark before ignition and after the burn', () => {
    expect(sparklerIntensity(stick, 0)).toBe(0);
    expect(sparklerIntensity(stick, stick.burnEndMs)).toBe(0);
    expect(sparklerIntensity(stick, 99_999)).toBe(0);
  });

  it('ramps up, holds near full, then dies away', () => {
    const span = stick.burnEndMs - stick.burnStartMs;
    const lit = sparklerIntensity(stick, stick.burnStartMs + span * 0.2);
    const held = sparklerIntensity(stick, stick.burnStartMs + span * 0.5);
    const dying = sparklerIntensity(stick, stick.burnStartMs + span * 0.97);
    expect(lit).toBeGreaterThan(0.5);
    expect(held).toBe(1);
    expect(dying).toBeGreaterThan(0);
    expect(dying).toBeLessThan(0.5);
  });

  it('keeps every stick burning in the middle of the show', () => {
    const plan = planSparklers({ durationMs: 3000, count: 4 });
    expect(burningSticks(plan, 1500)).toHaveLength(4);
    // Ignition is the instant the ramp starts, so nothing is alight at exactly 0.
    expect(burningSticks(plan, 0)).toHaveLength(0);
    expect(burningSticks(plan, 20)).toHaveLength(1);
    expect(burningSticks(plan, 4000)).toHaveLength(0);
  });
});

describe('isSparklerShowDone', () => {
  it('ends at the plan duration', () => {
    const plan = planSparklers({ durationMs: 1200 });
    expect(isSparklerShowDone(plan, 1199)).toBe(false);
    expect(isSparklerShowDone(plan, 1200)).toBe(true);
  });
});

describe('sparkleField', () => {
  const plan = planSparklers({ durationMs: 3000, count: 2, seed: 42 });

  it('emits nothing before ignition or after the show', () => {
    expect(sparkleField(plan, 0)).toHaveLength(0);
    expect(sparkleField(plan, 5000)).toHaveLength(0);
  });

  it('is deterministic per timestamp and frame', () => {
    const at1000 = sparkleField(plan, 1000);
    expect(at1000).toEqual(sparkleField(plan, 1000));
    expect(sparkleField(plan, 1400)).not.toEqual(at1000);
  });

  it('keeps every sparkle near its stick and in view', () => {
    const sparkles = sparkleField(plan, 1500);
    expect(sparkles.length).toBeGreaterThan(0);
    for (const sparkle of sparkles) {
      expect(Math.abs(sparkle.x - plan.origin.x)).toBeLessThan(plan.sticks[1].length + 0.3);
      expect(sparkle.life).toBeGreaterThan(0);
      expect(sparkle.life).toBeLessThanOrEqual(0.9);
      expect(sparkle.size).toBeGreaterThan(0);
    }
  });

  it('thins out when density is lowered, and stays bounded when raised', () => {
    const normal = sparkleField(plan, 1500, 1).length;
    const sparse = sparkleField(plan, 1500, 0.2).length;
    const dense = sparkleField(plan, 1500, 9).length;
    expect(sparse).toBeLessThan(normal);
    expect(dense).toBeGreaterThan(normal);
    expect(dense).toBeLessThanOrEqual(plan.sticks.length * 14);
  });

  it('throws a shorter reach when motion is reduced', () => {
    const single = planSparklers({ durationMs: 3000, count: 1, seed: 42 });
    const still = planSparklerStill({ durationMs: 3000, count: 1, seed: 42 });
    const reachOf = (plan: typeof single) => {
      const tip = sparklerTip(plan.sticks[0], 1500);
      const sparkles = sparkleField(plan, 1500);
      return Math.max(...sparkles.map((s) => Math.hypot(s.x - tip.x, s.y - tip.y)));
    };
    expect(reachOf(single)).toBeGreaterThan(0.06);
    expect(reachOf(still)).toBeLessThan(0.06);
  });
});
