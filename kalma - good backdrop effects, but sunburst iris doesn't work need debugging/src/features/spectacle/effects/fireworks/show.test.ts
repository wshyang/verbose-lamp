import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/shared/lib/random';
import { circleOverlapsRect } from '../../model/geometry';
import { shellRecipe, shellSparks } from './shells';
import { burstRadiusNorm, planShow } from './show';

describe('shell recipes', () => {
  it('are deterministic per seed (seed 1925)', () => {
    const a = shellSparks('kamuro', mulberry32(1925), 1, false);
    const b = shellSparks('kamuro', mulberry32(1925), 1, false);
    expect(a).toEqual(b);
    expect(a.length).toBe(shellRecipe('kamuro').count);
  });

  it('double-break adds an emerald pistil when green light is on', () => {
    const sparks = shellSparks('double-break', mulberry32(1925), 1, true);
    expect(sparks.some((s) => s.green)).toBe(true);
  });

  it('ring sparks lie on a tilted circle', () => {
    const sparks = shellSparks('ring', mulberry32(7), 1, false);
    for (const s of sparks) {
      const r = Math.hypot(s.dx, s.dy / 0.56);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.1);
    }
  });
});

describe('planShow', () => {
  it('is deterministic per seed', () => {
    expect(planShow({ seed: 1925, finale: true })).toEqual(planShow({ seed: 1925, finale: true }));
  });

  it('never overlaps keep-clear rects, over 200 seeds', () => {
    const rect = { x: 0.38, y: 0.18, w: 0.24, h: 0.3 };
    for (let seed = 0; seed < 200; seed += 1) {
      const events = planShow({ seed, keepClear: [rect], finale: true, intensity: 1 });
      for (const e of events) {
        const hit = circleOverlapsRect({ x: e.x, y: e.y }, burstRadiusNorm(e.depth), rect, 16 / 9);
        expect(hit).toBe(false);
      }
    }
  });

  it('keeps bursts in the upper band and ends with a dense finale', () => {
    const events = planShow({ seed: 42, finale: true, durationMs: 12000, intensity: 0.7 });
    for (const e of events) expect(e.y).toBeLessThanOrEqual(0.65);
    const finaleCount = events.filter((e) => e.tMs >= 8500).length;
    expect(finaleCount).toBeGreaterThanOrEqual(10);
  });
});