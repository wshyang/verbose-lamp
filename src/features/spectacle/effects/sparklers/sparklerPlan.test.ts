import { describe, expect, it } from 'vitest';
import { maxFlashRate } from '../../model/motionPolicy';
import { planSparklerCrossfade, planSparklerTransition } from './sparklerPlan';

const origins = [
  { x: 0.5, y: 0.5 },
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 0.12, y: 0.87 },
];

describe('planSparklerTransition', () => {
  it('targets are off-screen for any origin, both patterns', () => {
    for (const origin of origins) {
      for (const pattern of ['sides', 'corners'] as const) {
        const plan = planSparklerTransition({ origin, pattern, direction: 'outward' });
        expect(plan.tracks.length).toBe(pattern === 'sides' ? 2 : 4);
        for (const track of plan.tracks) {
          const outside = track.target.x < 0 || track.target.x > 1 || track.target.y < 0 || track.target.y > 1;
          expect(outside).toBe(true);
        }
      }
    }
  });

  it('onCovered sits inside the flash plateau', () => {
    for (const direction of ['outward', 'inward'] as const) {
      const plan = planSparklerTransition({ origin: origins[0], pattern: 'corners', direction });
      const segment = plan.flash[0];
      expect(plan.onCoveredMs).toBeGreaterThanOrEqual(segment.startMs + segment.attackMs);
      expect(plan.onCoveredMs).toBeLessThanOrEqual(segment.startMs + segment.attackMs + segment.holdMs);
    }
  });

  it('inward collision is exactly the end of travel', () => {
    const plan = planSparklerTransition({ origin: origins[3], pattern: 'sides', direction: 'inward' });
    expect(plan.collisionMs).toBe(plan.travelEndMs);
  });

  it('passes the photosensitivity guard', () => {
    for (const direction of ['outward', 'inward'] as const) {
      const plan = planSparklerTransition({ origin: origins[0], pattern: 'sides', direction });
      expect(maxFlashRate(plan.flash)).toBeLessThanOrEqual(3);
      for (const segment of plan.flash) expect(segment.attackMs).toBeGreaterThanOrEqual(80);
    }
  });

  it('reduced motion becomes a 400 ms crossfade that still covers', () => {
    const plan = planSparklerCrossfade({ origin: origins[0], pattern: 'sides', direction: 'outward' });
    expect(plan.crossfade).toBe(true);
    expect(plan.durationMs).toBe(400);
    expect(plan.onCoveredMs).toBe(200);
  });
});
