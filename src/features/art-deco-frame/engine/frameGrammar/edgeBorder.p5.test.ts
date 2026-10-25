// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildEdgeBorder } from './index';
import { SIGNATURE_GENOME, withGene, clampGene } from './genome';

describe('genome and border edge cases', () => {
  it('falls back to the signature gene for non-finite values', () => {
    expect(clampGene('rayDensity', Number.NaN)).toBe(SIGNATURE_GENOME.rayDensity);
    expect(clampGene('wingDelta', Number.POSITIVE_INFINITY)).toBe(SIGNATURE_GENOME.wingDelta);
  });

  it('refines corner fans and reeding when the fractal genes are engaged', () => {
    const fractal = withGene(
      withGene(withGene(SIGNATURE_GENOME, 'fractalDepth', 3), 'fractalRatio', 0.3),
      'rayDensity',
      1.6
    );
    const plain = buildEdgeBorder({ aspect: 1.78, genome: SIGNATURE_GENOME, density: 1 });
    const refined = buildEdgeBorder({ aspect: 1.78, genome: fractal, density: 1 });
    expect(refined.specs.length).toBeGreaterThan(plain.specs.length);
    expect(
      refined.specs.every((spec) => spec.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    ).toBe(true);
  });
});
describe('viewport edge border seam snapping', () => {
  it('snaps a corner-fan arc that lands on the seam to exact zero', () => {
    // reach (0.42 * rayReach) equals the fan origin x (aspect - 0.02 = 0.48),
    // so the base-arc endpoint falls on x = 0 within float error.
    const genome = withGene(SIGNATURE_GENOME, 'rayReach', 0.48 / 0.42);
    const { specs } = buildEdgeBorder({ aspect: 0.5, genome, density: 0.5 });
    const seam = specs.flatMap((spec) => spec.points).filter((point) => point.x === 0 && Math.abs(point.y) > 0.97);
    expect(seam.length).toBeGreaterThan(0);
  });
});
