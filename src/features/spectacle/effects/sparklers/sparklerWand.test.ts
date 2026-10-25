import { describe, expect, it } from 'vitest';
import { sparklerFlicker, wandGeometry, type WandGeometryRequest } from './sparklerWand';

const request = (overrides: Partial<WandGeometryRequest> = {}): WandGeometryRequest => ({
  tip: { x: 100, y: 80 },
  direction: { x: 2, y: 0 },
  lengthPx: 80,
  burnProgress: 0.25,
  swayPx: 10,
  ...overrides,
});

describe('wandGeometry', () => {
  it('trails the wire behind the direction of travel with a burned section', () => {
    const wand = wandGeometry(request());

    expect(wand.tip).toEqual({ x: 100, y: 80 });
    expect(wand.handle.x).toBeCloseTo(20);
    expect(wand.handle.y).toBeCloseTo(90);
    expect(wand.burnFront.x).toBeCloseTo(80);
    expect(wand.burnFront.y).toBeCloseTo(82.5);
  });

  it('keeps the handle exactly lengthPx behind the tip when there is no sway', () => {
    const wand = wandGeometry(request({ swayPx: 0, direction: { x: 3, y: 4 } }));

    expect(Math.hypot(wand.handle.x - 100, wand.handle.y - 80)).toBeCloseTo(80);
    expect(wand.handle.x).toBeCloseTo(100 - 3 * 16);
    expect(wand.handle.y).toBeCloseTo(80 - 4 * 16);
  });

  it('swings the handle along the perpendicular of travel, by the sign of the sway', () => {
    const plus = wandGeometry(request({ swayPx: 10 }));
    const minus = wandGeometry(request({ swayPx: -10 }));

    // Travelling along +x the perpendicular is +y; the x of the handle is untouched by sway.
    expect(plus.handle).toEqual({ x: 20, y: 90 });
    expect(minus.handle).toEqual({ x: 20, y: 70 });
  });

  it('sways about the heading when travelling vertically too', () => {
    const wand = wandGeometry(request({ direction: { x: 0, y: 1 }, swayPx: 10 }));

    // Travelling along +y the perpendicular is -x: the handle trails above and swings left.
    expect(wand.handle.x).toBeCloseTo(90);
    expect(wand.handle.y).toBeCloseTo(0);
  });

  it('ignores the size of the direction vector, only its heading', () => {
    expect(wandGeometry(request({ direction: { x: 0.001, y: 0 } }))).toEqual(
      wandGeometry(request({ direction: { x: 900, y: 0 } }))
    );
  });

  it('puts the burn front on the tip at zero progress and on the handle at full progress', () => {
    const fresh = wandGeometry(request({ burnProgress: 0 }));
    const spent = wandGeometry(request({ burnProgress: 1 }));

    expect(fresh.burnFront).toEqual(fresh.tip);
    expect(spent.burnFront).toEqual(spent.handle);
  });

  it('clamps burn progress outside 0..1', () => {
    expect(wandGeometry(request({ burnProgress: 2 })).burnFront).toEqual(
      wandGeometry(request({ burnProgress: 1 })).burnFront
    );
    expect(wandGeometry(request({ burnProgress: -1 })).burnFront).toEqual(
      wandGeometry(request({ burnProgress: 0 })).burnFront
    );
  });

  it('gives a stable downward wand for a zero direction instead of NaN', () => {
    const wand = wandGeometry(request({ tip: { x: 10, y: 10 }, direction: { x: 0, y: 0 }, lengthPx: 50, swayPx: 0 }));

    expect(wand.handle).toEqual({ x: 10, y: -40 });
    expect(Object.values(wand.burnFront).every(Number.isFinite)).toBe(true);
  });

  it('does not move or share the tip it was given', () => {
    const tip = { x: 5, y: 6 };
    const wand = wandGeometry(request({ tip }));

    expect(wand.tip).toEqual(tip);
    expect(wand.tip).not.toBe(tip);
  });
});

describe('sparklerFlicker', () => {
  it('is deterministic and stays inside the photographic flicker band', () => {
    for (let timeMs = 0; timeMs < 4000; timeMs += 11) {
      const value = sparklerFlicker({ seed: 4, timeMs });

      expect(value).toBe(sparklerFlicker({ seed: 4, timeMs }));
      expect(value).toBeGreaterThanOrEqual(0.82);
      expect(value).toBeLessThan(1.1);
    }
  });

  it('holds one value for a whole 45 ms bucket and changes between buckets', () => {
    expect(sparklerFlicker({ seed: 4, timeMs: 90 })).toBe(sparklerFlicker({ seed: 4, timeMs: 134 }));

    const values = new Set(Array.from({ length: 40 }, (_, bucket) => sparklerFlicker({ seed: 4, timeMs: bucket * 45 })));
    expect(values.size).toBeGreaterThan(20);
  });

  it('flickers each sparkler out of step with its neighbours', () => {
    const a = Array.from({ length: 20 }, (_, i) => sparklerFlicker({ seed: 1, timeMs: i * 45 }));
    const b = Array.from({ length: 20 }, (_, i) => sparklerFlicker({ seed: 2, timeMs: i * 45 }));

    expect(a).not.toEqual(b);
  });
});
