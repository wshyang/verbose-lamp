import { describe, expect, it } from 'vitest';
import { MAX_AIM_STEP_SECONDS, POINTER_EASE_PER_SECOND, normalisePointer, stepToward } from './pointerAim';

// Expected values come from the shipped manager's pointer code:
//   nx = (clientX / Math.max(1, innerWidth)) * 2 - 1
//   ny = -((clientY / Math.max(1, innerHeight)) * 2 - 1)
//   smooth.lerp(target, Math.min(1, Math.min(0.05, dt) * 4.5))
describe('normalisePointer', () => {
  it('maps the screen to -1..1 with up positive', () => {
    expect(normalisePointer(0, 0, 1280, 720)).toEqual({ x: -1, y: 1 });
    expect(normalisePointer(1280, 720, 1280, 720)).toEqual({ x: 1, y: -1 });
    expect(normalisePointer(640, 360, 1280, 720)).toEqual({ x: 0, y: -0 });
    expect(normalisePointer(960, 180, 1280, 720)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('never divides by a zero-sized window', () => {
    const point = normalisePointer(50, 50, 0, 0);

    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
    expect(point).toEqual({ x: 99, y: -99 });
  });
});

describe('stepToward', () => {
  const origin = { x: 0, y: 0 };
  const target = { x: 1, y: -1 };

  it('eases a fraction of the way each frame', () => {
    const next = stepToward(origin, target, 0.016);

    expect(next.x).toBeCloseTo(0.016 * POINTER_EASE_PER_SECOND, 12);
    expect(next.y).toBeCloseTo(-0.016 * POINTER_EASE_PER_SECOND, 12);
  });

  it('stands still when there is no frame time or the delta is negative', () => {
    expect(stepToward(origin, target, 0)).toEqual(origin);
    expect(stepToward(origin, target, -1)).toEqual(origin);
  });

  // The shipped manager capped the frame delta at 50 ms *before* easing, so a stalled frame
  // moves the aim by at most 0.225 of the distance rather than snapping all the way there.
  it('caps a stalled frame at 50 ms so the aim does not snap', () => {
    const stalled = stepToward(origin, target, 5);
    const capped = stepToward(origin, target, MAX_AIM_STEP_SECONDS);

    expect(stalled).toEqual(capped);
    expect(stalled.x).toBeCloseTo(0.225, 12);
    expect(MAX_AIM_STEP_SECONDS).toBe(0.05);
  });

  it('treats a NaN delta as no time passing', () => {
    expect(stepToward(origin, target, Number.NaN)).toEqual(origin);
  });

  it('is exactly where the target already is when it arrives', () => {
    expect(stepToward(target, target, 0.016)).toEqual(target);
  });

  it('converges on the target over many frames without overshooting', () => {
    let smooth = { x: 0, y: 0 };
    for (let frame = 0; frame < 300; frame += 1) {
      smooth = stepToward(smooth, target, 0.016);
      expect(smooth.x).toBeLessThanOrEqual(1);
      expect(smooth.y).toBeGreaterThanOrEqual(-1);
    }

    expect(smooth.x).toBeCloseTo(1, 3);
    expect(smooth.y).toBeCloseTo(-1, 3);
  });

  it('does not mutate the vectors it is given', () => {
    const smooth = { x: 0.2, y: 0.2 };
    const aim = { x: 1, y: 1 };

    stepToward(smooth, aim, 0.016);

    expect(smooth).toEqual({ x: 0.2, y: 0.2 });
    expect(aim).toEqual({ x: 1, y: 1 });
  });
});
