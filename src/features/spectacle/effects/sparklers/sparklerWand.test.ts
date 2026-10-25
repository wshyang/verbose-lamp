import { describe, expect, it } from 'vitest';
import { sparklerFlicker, wandGeometry } from './sparklerWand';

describe('wandGeometry', () => {
  it('trails the wire behind the direction of travel with a burned section', () => {
    const wand = wandGeometry({
      tip: { x: 100, y: 80 },
      direction: { x: 2, y: 0 },
      lengthPx: 80,
      burnProgress: 0.25,
      swayPx: 10,
    });
    expect(wand.tip).toEqual({ x: 100, y: 80 });
    expect(wand.handle.x).toBeCloseTo(20);
    expect(wand.handle.y).toBeCloseTo(90);
    expect(wand.burnFront.x).toBeCloseTo(80);
    expect(wand.burnFront.y).toBeCloseTo(82.5);
  });

  it('normalizes direction, clamps burn, and gives a stable zero-direction wand', () => {
    const wand = wandGeometry({
      tip: { x: 10, y: 10 },
      direction: { x: 0, y: 0 },
      lengthPx: 50,
      burnProgress: 2,
      swayPx: 0,
    });
    expect(Math.hypot(wand.handle.x - 10, wand.handle.y - 10)).toBeCloseTo(50);
    expect(wand.burnFront).toEqual(wand.handle);
  });
});

describe('sparklerFlicker', () => {
  it('is deterministic and stays in a photographic flicker range', () => {
    for (let timeMs = 0; timeMs < 2000; timeMs += 37) {
      const a = sparklerFlicker({ seed: 4, timeMs });
      expect(a).toBe(sparklerFlicker({ seed: 4, timeMs }));
      expect(a).toBeGreaterThanOrEqual(0.72);
      expect(a).toBeLessThanOrEqual(1.18);
    }
  });
});
