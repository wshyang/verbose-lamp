import { describe, expect, it } from 'vitest';
import { flashIntensityAt, maxFlashRate, sanitizeFlashPlan } from './motionPolicy';

describe('sanitizeFlashPlan', () => {
  it('clamps attacks to at least 80 ms', () => {
    const plan = sanitizeFlashPlan([{ startMs: 0, attackMs: 10, holdMs: 100, decayMs: 200, peak: 1 }]);
    expect(plan[0].attackMs).toBe(80);
  });

  it('never allows more than 3 large flashes per second', () => {
    const burst = Array.from({ length: 9 }, (_, i) => ({
      startMs: i * 120,
      attackMs: 80,
      holdMs: 20,
      decayMs: 100,
      peak: 1,
    }));
    const safe = sanitizeFlashPlan(burst);
    expect(maxFlashRate(safe)).toBeLessThanOrEqual(3);
  });

  it('does not throw on empty or unordered input', () => {
    expect(sanitizeFlashPlan([])).toEqual([]);
    const plan = sanitizeFlashPlan([
      { startMs: 900, attackMs: 90, holdMs: 0, decayMs: 100, peak: 1 },
      { startMs: 0, attackMs: 90, holdMs: 0, decayMs: 100, peak: 1 },
    ]);
    expect(plan[0].startMs).toBe(0);
  });
});

describe('flashIntensityAt', () => {
  it('ramps, holds and decays', () => {
    const seg = [{ startMs: 100, attackMs: 100, holdMs: 100, decayMs: 100, peak: 1 }];
    expect(flashIntensityAt(seg, 50)).toBe(0);
    expect(flashIntensityAt(seg, 150)).toBeCloseTo(0.5);
    expect(flashIntensityAt(seg, 250)).toBe(1);
    expect(flashIntensityAt(seg, 350)).toBeCloseTo(0.5);
    expect(flashIntensityAt(seg, 500)).toBe(0);
  });
});