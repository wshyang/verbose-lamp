// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { planShow } from './show';

describe('planShow saturation and defaults', () => {
  it('plans nothing when the whole sky is keep-clear, finale included', () => {
    const wholeSky = { x: -1, y: -1, w: 3, h: 3 };
    expect(planShow({ seed: 1925, durationMs: 12000, finale: true, keepClear: [wholeSky] })).toEqual([]);
  });

  it('defaults seed, duration, intensity, keep-clear and aspect', () => {
    expect(planShow({})).toEqual(
      planShow({ seed: 1925, durationMs: 12000, intensity: 0.5, keepClear: [], aspect: 16 / 9 })
    );
  });
});
