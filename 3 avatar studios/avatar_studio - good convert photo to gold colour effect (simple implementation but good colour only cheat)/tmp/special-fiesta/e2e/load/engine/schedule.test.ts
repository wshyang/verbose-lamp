import { describe, expect, it } from 'vitest';
import { expectedAt, fixedSchedule, rampSchedule } from './schedule.js';

describe('fixedSchedule — all N within the window (claim A)', () => {
  it('admits exactly the asked-for users, inside the window, in order', () => {
    const steps = fixedSchedule({ users: 300, windowMs: 60_000 });
    expect(steps.reduce((sum, step) => sum + step.admit, 0)).toBe(300);
    expect(steps[0]?.atMs).toBe(0);
    for (const step of steps) expect(step.atMs).toBeLessThanOrEqual(60_000);
    const times = steps.map((step) => step.atMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('spreads an uneven batch count without losing or inventing users', () => {
    const steps = fixedSchedule({ users: 301, windowMs: 30_000, batches: 10 });
    expect(steps.reduce((sum, step) => sum + step.admit, 0)).toBe(301);
    expect(steps[0]?.admit).toBe(31); // the remainder spreads across the first batches
    expect(steps.every((step) => step.admit >= 30)).toBe(true);
  });

  it('refuses nonsense rather than inventing a schedule', () => {
    expect(() => fixedSchedule({ users: 0, windowMs: 1_000 })).toThrow();
    expect(() => fixedSchedule({ users: 10, windowMs: -1 })).toThrow();
  });
});

describe('expectedAt — the admission curve the beats are measured against', () => {
  it('counts who was let in by a given moment, and holds the total after the last batch', () => {
    const steps = fixedSchedule({ users: 300, windowMs: 60_000, batches: 10 });
    const lastAt = steps[steps.length - 1]?.atMs ?? 0;
    expect(expectedAt(steps, 0)).toBe(30);
    expect(expectedAt(steps, 30_000)).toBeGreaterThanOrEqual(150);
    expect(expectedAt(steps, lastAt - 1)).toBeLessThan(300);
    expect(expectedAt(steps, lastAt)).toBe(300);
    expect(expectedAt(steps, 10 * 60_000)).toBe(300);
  });

  it('answers zero before anything was admitted', () => {
    expect(expectedAt(fixedSchedule({ users: 10, windowMs: 1_000 }), -1)).toBe(0);
  });
});

describe('rampSchedule — steps to the ceiling (claim B)', () => {
  it('climbs by stepUsers every stepMs and clips the final step to the ceiling', () => {
    const steps = rampSchedule({ stepUsers: 25, stepMs: 15_000, ceiling: 110 });
    expect(steps.reduce((sum, step) => sum + step.admit, 0)).toBe(110);
    expect(steps.map((step) => step.admit)).toEqual([25, 25, 25, 25, 10]);
    expect(steps.map((step) => step.atMs)).toEqual([0, 15_000, 30_000, 45_000, 60_000]);
  });

  it('handles a zero ceiling and refuses negative shapes', () => {
    expect(rampSchedule({ stepUsers: 10, stepMs: 1_000, ceiling: 0 })).toEqual([]);
    expect(() => rampSchedule({ stepUsers: 0, stepMs: 1_000, ceiling: 10 })).toThrow();
    expect(() => rampSchedule({ stepUsers: 10, stepMs: 0, ceiling: 10 })).toThrow();
  });
});
