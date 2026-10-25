import { describe, expect, it } from 'vitest';
import { apexTime, positionAt, velocityAt } from './ballistics';

describe('ballistics closed form', () => {
  it('matches a fine Euler integration within 1e-3 (relative units)', () => {
    const m = { p0: 0.2, v0: -0.9, k: 1.4, g: 0.5 };
    const dt = 1e-4;
    let p = m.p0;
    let v = m.v0;
    for (let t = 0; t < 2; t += dt) {
      v += (-m.k * v + m.g) * dt;
      p += v * dt;
      if (Math.abs(t - Math.round(t * 4) / 4) < dt / 2) {
        expect(Math.abs(positionAt(m, t + dt) - p)).toBeLessThan(1e-3);
      }
    }
  });

  it('falls back to drag-free parabola when k≈0', () => {
    const m = { p0: 0, v0: 1, k: 0, g: 2 };
    expect(positionAt(m, 1)).toBeCloseTo(2);
    expect(velocityAt(m, 1)).toBeCloseTo(3);
  });

  it('velocity approaches terminal g/k', () => {
    const m = { p0: 0, v0: -5, k: 2, g: 1 };
    expect(velocityAt(m, 10)).toBeCloseTo(0.5, 5);
  });
});

describe('apexTime', () => {
  it('solves v=0 for an upward launch', () => {
    const k = 1.2;
    const g = 0.6;
    const v0 = -1.1;
    const t = apexTime(v0, k, g);
    expect(Math.abs(velocityAt({ p0: 0, v0, k, g }, t))).toBeLessThan(1e-9);
  });

  it('drag-free limit and non-rising guards', () => {
    expect(apexTime(-2, 0, 1)).toBeCloseTo(2);
    expect(apexTime(1, 1, 1)).toBe(Infinity);
    expect(apexTime(-1, 1, 0)).toBe(Infinity);
  });
});
