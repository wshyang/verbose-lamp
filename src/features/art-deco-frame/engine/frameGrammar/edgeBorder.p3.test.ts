// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildEdgeBorder } from './index';
import { SIGNATURE_GENOME, withGene, type BaseGenome } from './genome';

describe('edge border recursion and limits', () => {
  const border = (aspect: number, density: number, genome: BaseGenome = SIGNATURE_GENOME) =>
    buildEdgeBorder({ aspect, genome, density });

  it('adds ruler ribs and sub-ticks once recursion is on', () => {
    const flat = border(1.78, 0.8);
    const recursive = border(1.78, 0.8, withGene(SIGNATURE_GENOME, 'fractalDepth', 2));
    expect(recursive.specs.length).toBeGreaterThan(flat.specs.length);
  });

  it('clamps the aspect and density into their documented ranges', () => {
    expect(border(99, 5).extentX).toBeLessThanOrEqual(3.2);
    expect(border(0.1, -5).extentX).toBeLessThanOrEqual(0.5);
    expect(border(0.1, -5).specs.length).toBeLessThan(border(99, 5).specs.length);
  });
});
