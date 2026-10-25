import { describe, expect, it } from 'vitest';
import { flutterX, foilVy, foilY } from './confettiPhysics';

describe('confetti physics', () => {
  it('speed converges to terminal velocity', () => {
    const f = { y0: 0, vy0: -0.4, vt: 0.22, k: 3 };
    expect(foilVy(f, 5)).toBeCloseTo(0.22, 4);
  });

  it('starts at y0 and moves down over time', () => {
    const f = { y0: 0.1, vy0: 0, vt: 0.25, k: 2.5 };
    expect(foilY(f, 0)).toBeCloseTo(0.1);
    expect(foilY(f, 2)).toBeGreaterThan(0.4);
  });

  it('flutter stays bounded around the drift path', () => {
    const f = { x0: 0.5, vx0: 0.1, k: 2, amp: 0.02, freq: 6, phase: 0.7 };
    for (let t = 0; t < 4; t += 0.1) {
      const drift = 0.5 + (0.1 * (1 - Math.exp(-2 * t))) / 2;
      expect(Math.abs(flutterX(f, t) - drift)).toBeLessThanOrEqual(0.021);
    }
  });
});