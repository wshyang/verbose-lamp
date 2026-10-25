// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { sparklerFlicker, wandGeometry } from './sparklerWand';

describe('wandGeometry', () => {
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
