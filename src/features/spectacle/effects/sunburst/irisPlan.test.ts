import { describe, expect, it } from 'vitest';
import { farthestCornerDistance } from '../../model/geometry';
import { MIN_VISIBLE_RADIUS_PX, irisRadiusAt, irisRadiusPx, planIris, planIrisCrossfade } from './irisPlan';

const origins = [
  { x: 0.5, y: 0.5 },
  { x: 0, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.97, y: 0.99 },
];

describe('irisPlan', () => {
  it('fully covers the viewport at onCovered for edge and corner origins', () => {
    for (const origin of origins) {
      const plan = planIris({ origin });
      const r = irisRadiusAt(plan, plan.onCoveredMs, 3.2);
      expect(r).toBeGreaterThanOrEqual(farthestCornerDistance(origin, 3.2));
      expect(plan.onCoveredMs).toBe(plan.coverEndMs);
    }
  });

  it('retracts to zero by the end', () => {
    const plan = planIris({ origin: origins[0] });
    expect(irisRadiusAt(plan, plan.durationMs, 16 / 9)).toBeCloseTo(0);
  });

  it('reduced motion degrades to a short crossfade', () => {
    const plan = planIrisCrossfade({ origin: origins[0] });
    expect(plan.crossfade).toBe(true);
    expect(plan.durationMs).toBe(400);
  });

  describe('irisRadiusPx', () => {
    const viewports = [
      { name: 'desktop 1440x900', w: 1440, h: 900 },
      { name: 'portrait phone 390x844', w: 390, h: 844 },
    ] as const;
    const centre = { x: 0.5, y: 0.42 };
    const STEP_MS = 10;
    // The cubic ease-in is sub-pixel for its first ~50 ms by design; from here on it must show.
    const VISIBLE_FROM_MS = 100;

    for (const viewport of viewports) {
      it(`is visibly large through the whole cover phase on ${viewport.name}`, () => {
        const plan = planIris({ origin: centre });
        for (let t = VISIBLE_FROM_MS; t <= plan.coverEndMs; t += STEP_MS) {
          expect(irisRadiusPx(plan, t, viewport)).toBeGreaterThan(MIN_VISIBLE_RADIUS_PX);
        }
      });

      it(`reaches the farthest corner in pixels at onCovered on ${viewport.name}`, () => {
        const plan = planIris({ origin: centre });
        const farthestPx = Math.hypot(
          Math.max(centre.x, 1 - centre.x) * viewport.w,
          Math.max(centre.y, 1 - centre.y) * viewport.h,
        );
        expect(irisRadiusPx(plan, plan.onCoveredMs, viewport)).toBeGreaterThanOrEqual(farthestPx);
      });

      it(`retracts to nothing at the end on ${viewport.name}`, () => {
        const plan = planIris({ origin: centre });
        expect(irisRadiusPx(plan, plan.durationMs, viewport)).toBeCloseTo(0);
      });
    }
  });
});
