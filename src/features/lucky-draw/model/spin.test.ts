import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import { planSpin } from './spin';

describe('planSpin', () => {
  it('lands exactly on the winner over 1000 seeds', () => {
    for (let seed = 0; seed < 1000; seed += 1) {
      const rng = mulberry32(seed);
      const n = 2 + Math.floor(rng() * 300);
      const winnerIndex = Math.floor(rng() * n);
      const startP = rng() * 50;
      const profile = planSpin({ startP, winnerIndex, n });
      const landed = ((profile.positionAt(profile.durationMs) % n) + n) % n;
      expect(Math.abs(landed - winnerIndex)).toBeLessThan(1e-6);
    }
  });

  it('velocity is continuous at phase boundaries', () => {
    const profile = planSpin({ startP: 0, winnerIndex: 17, n: 30 });
    for (let ms = 10; ms < profile.durationMs - 710; ms += 10) {
      const a = profile.velocityAt(ms);
      const b = profile.velocityAt(ms + 10);
      expect(Math.abs(a - b)).toBeLessThan(0.5);
    }
  });

  it('never reverses outside windup and settle', () => {
    const profile = planSpin({ startP: 4.2, winnerIndex: 3, n: 300 });
    for (let ms = 300; ms < profile.durationMs - 750; ms += 25) {
      expect(profile.positionAt(ms + 25)).toBeGreaterThanOrEqual(profile.positionAt(ms) - 1e-9);
    }
  });

  it('keeps cruise at or above the minimum and can skip the settle', () => {
    const profile = planSpin({ startP: 0, winnerIndex: 1, n: 2, minCruiseMs: 1200, settle: false });
    expect(profile.cruiseMs).toBeGreaterThanOrEqual(1199);
    const landed = profile.positionAt(profile.durationMs) % 2;
    expect(Math.abs(landed - 1)).toBeLessThan(1e-6);
  });
});
describe('spin profile at the edges', () => {
  it('holds the start position before the drum moves', () => {
    const profile = planSpin({ startP: 0.2, winnerIndex: 7, n: 30 });
    expect(profile.positionAt(0)).toBe(0.2);
    expect(profile.positionAt(-50)).toBe(0.2);
    expect(profile.velocityAt(0)).toBe(0);
  });
});
