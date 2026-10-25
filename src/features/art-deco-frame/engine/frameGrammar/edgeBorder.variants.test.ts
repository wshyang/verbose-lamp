import { describe, expect, it } from 'vitest';
import { buildEdgeBorder } from './edgeBorder';
import { SIGNATURE_GENOME, type BaseGenome } from './genome';

describe('edge border genome variants', () => {
  it('exercises recursive fans/reeding, filtering, clamps, and lattice selection', () => {
    const recursive: BaseGenome = {
      ...SIGNATURE_GENOME, fractalDepth: 3, fractalRatio: 0.3,
      raySpread: 0.75, rayDensity: 0.5, rayReach: 0.75, wingSweep: 0.6, wingDelta: -3,
    };
    const variants = [
      buildEdgeBorder({ aspect: 0.1, density: -1, genome: recursive }),
      buildEdgeBorder({ aspect: 9, density: 2, genome: recursive }),
      buildEdgeBorder({
        aspect: 1.4, density: 0.5,
        genome: { ...recursive, fractalDepth: 1, fractalRatio: 0.6, raySpread: 1.2 },
      }),
      buildEdgeBorder({ aspect: 1.4, density: 0.5, pattern: 'poster' }),
      buildEdgeBorder({ aspect: 1.4, density: 0.5, pattern: 'lattice', seed: 7 }),
    ];
    for (const border of variants) {
      expect(border.specs.length).toBeGreaterThan(0);
      expect(Number.isFinite(border.extentX)).toBe(true);
      expect(Number.isFinite(border.extentY)).toBe(true);
    }
    expect(variants[4].specs.every((spec) => spec.points.length >= 2)).toBe(true);
  });
});
