import { describe, expect, it } from 'vitest';
import { farthestCornerDistance } from '../../model/geometry';
import { irisRadiusAt, planIris } from './irisPlan';

const origins = [
  { x: 0.5, y: 0.5 },
  { x: 0, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.97, y: 0.99 },
];

describe('irisPlan', () => {
  it('fully covers the viewport at onCovered for edge and corner origins', () => {
    for (const origin of origins) {
      const plan = planIris({ origin }, false);
      const r = irisRadiusAt(plan, plan.onCoveredMs, 3.2);
      expect(r).toBeGreaterThanOrEqual(farthestCornerDistance(origin, 3.2));
      expect(plan.onCoveredMs).toBe(plan.coverEndMs);
    }
  });

  it('retracts to zero by the end', () => {
    const plan = planIris({ origin: origins[0] }, false);
    expect(irisRadiusAt(plan, plan.durationMs, 16 / 9)).toBeCloseTo(0);
  });

  it('reduced motion degrades to a short crossfade', () => {
    const plan = planIris({ origin: origins[0] }, true);
    expect(plan.crossfade).toBe(true);
    expect(plan.durationMs).toBe(400);
  });
});