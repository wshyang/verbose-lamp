import { describe, expect, it } from 'vitest';
import { buildEdgeBorder } from './edgeBorder';
import { SIGNATURE_GENOME } from './genome';

describe('edge border seam snapping and reeding recursion', () => {
  it('snaps a corner-fan rib landing exactly on the centre seam to x = 0', () => {
    // aspect clamps to 0.5; origin.x = 0.48 and reach = 0.42 * (0.48 / 0.42),
    // so the first rib (angle PI) ends at x = 0 within seam epsilon.
    const border = buildEdgeBorder({
      aspect: 0.5, density: 0.5,
      genome: { ...SIGNATURE_GENOME, rayReach: 0.48 / 0.42 },
    });
    const seamRay = border.specs.find(
      (spec) => spec.kind === 'ray' && spec.points.some((point) => point.x === 0),
    );
    expect(seamRay).toBeDefined();
  });

  it('subdivides vertical reeding runs as well as horizontal ones', () => {
    const aspect = 1.6;
    const border = buildEdgeBorder({
      aspect, density: 0.5,
      genome: { ...SIGNATURE_GENOME, fractalDepth: 1, fractalRatio: 0.45 },
    });
    // Sub-ticks sit one z-step behind their parent ticks (z -0.01 -> -0.02).
    // A vertical-run sub-tick is a horizontal segment hugging the side edge.
    const sideSubTick = border.specs.find((spec) => (
      spec.z === -0.02
      && spec.points.length === 2
      && spec.points[0].y === spec.points[1].y
      && Math.abs(spec.points[0].x) > aspect - 0.2
    ));
    expect(sideSubTick).toBeDefined();
  });
});
