// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { circleOverlapsRect } from '../../model/geometry';
import { burstRadiusNorm, planShow } from './show';
import { type NormRect } from '../../model/types';

const EVERYTHING: NormRect = { x: 0, y: 0, w: 1, h: 1 };
describe('planShow with no room for a burst', () => {
  it('places nothing when the whole sky is off limits', () => {
    const events = planShow({ seed: 1925, intensity: 1, keepClear: [EVERYTHING] });
    expect(events).toEqual([]);
  });

  it('keeps bursts out of the speaker box but fills the rest of the sky', () => {
    const speaker: NormRect = { x: 0.35, y: 0.2, w: 0.3, h: 0.3 };
    const events = planShow({ seed: 1925, intensity: 1, keepClear: [speaker], aspect: 16 / 9 });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      const overlaps = circleOverlapsRect({
        centre: { x: event.x, y: event.y },
        radius: burstRadiusNorm(event.depth) + 0.02,
        rect: speaker,
        aspect: 16 / 9,
      });
      expect(overlaps).toBe(false);
    }
  });

  it('a finale adds its closing volley inside the show', () => {
    const plain = planShow({ seed: 1925, intensity: 0.5, durationMs: 12_000 });
    const finale = planShow({ seed: 1925, intensity: 0.5, durationMs: 12_000, finale: true });
    expect(finale.length).toBeGreaterThan(plain.length);
    expect(Math.max(...finale.map((event) => event.tMs))).toBeLessThanOrEqual(12_000);
  });
});
describe('planShow defaults', () => {
  it('plans a house show when given no options at all', () => {
    const events = planShow({});
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.tMs <= 12_000)).toBe(true);
  });
});
