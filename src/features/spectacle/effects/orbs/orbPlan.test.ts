import { describe, expect, it } from 'vitest';
import { maxFlashRate } from '../../model/motionPolicy';
import { planOrbCrossfade, planOrbTransition } from './orbPlan';

const origins = [
  { x: 0.5, y: 0.5 },
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 0.12, y: 0.87 },
];

describe('planOrbTransition', () => {
  it('targets are off-screen for any origin, both patterns', () => {
    for (const origin of origins) {
      for (const pattern of ['sides', 'corners'] as const) {
        const plan = planOrbTransition({ origin, pattern, direction: 'outward' });
        expect(plan.tracks.length).toBe(pattern === 'sides' ? 2 : 4);
        for (const t of plan.tracks) {
          const outside = t.target.x < 0 || t.target.x > 1 || t.target.y < 0 || t.target.y > 1;
          expect(outside).toBe(true);
        }
      }
    }
  });

  it('onCovered sits inside the flash plateau', () => {
    for (const direction of ['outward', 'inward'] as const) {
      const plan = planOrbTransition({ origin: origins[0], pattern: 'corners', direction });
      const seg = plan.flash[0];
      expect(plan.onCoveredMs).toBeGreaterThanOrEqual(seg.startMs + seg.attackMs);
      expect(plan.onCoveredMs).toBeLessThanOrEqual(seg.startMs + seg.attackMs + seg.holdMs);
    }
  });

  it('inward collision is exactly the end of travel', () => {
    const plan = planOrbTransition({ origin: origins[3], pattern: 'sides', direction: 'inward' });
    expect(plan.collisionMs).toBe(plan.travelEndMs);
  });

  it('passes the photosensitivity guard', () => {
    for (const direction of ['outward', 'inward'] as const) {
      const plan = planOrbTransition({ origin: origins[0], pattern: 'sides', direction });
      expect(maxFlashRate(plan.flash)).toBeLessThanOrEqual(3);
      for (const s of plan.flash) expect(s.attackMs).toBeGreaterThanOrEqual(80);
    }
  });

  it('reduced motion becomes a 400 ms crossfade that still covers', () => {
    const plan = planOrbCrossfade({ origin: origins[0], pattern: 'sides', direction: 'outward' });
    expect(plan.crossfade).toBe(true);
    expect(plan.durationMs).toBe(400);
    expect(plan.onCoveredMs).toBe(200);
  });
});
describe('a target sitting on the origin', () => {
  it('falls back to a unit chord length so the arc stays finite', () => {
    const origin = { x: 0.5, y: 0.5 };
    const plan = planOrbTransition({ origin, pattern: [origin], direction: 'outward' });
    expect(plan.tracks).toHaveLength(1);
    for (const value of Object.values(plan.tracks[0].control)) expect(Number.isFinite(value)).toBe(true);
  });
});
