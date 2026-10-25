import { describe, expect, it } from 'vitest';
import type { LatticeSpec } from '@/features/deco-lattice';
import { latticeKind } from './edgeBorder';

const spec = (rank: LatticeSpec['rank'], layer: LatticeSpec['layer']): LatticeSpec => ({
  points: [],
  width: 1,
  layer,
  rank,
});

describe('latticeKind', () => {
  it('calls the outer frame line a frame, whatever its layer', () => {
    expect(latticeKind(spec(0, 0))).toBe('frame');
    expect(latticeKind(spec(0, 2))).toBe('frame');
  });

  it('drops a thin inner line on the first two layers into a rule', () => {
    expect(latticeKind(spec(1, 0))).toBe('rule');
    expect(latticeKind(spec(2, 1))).toBe('rule');
  });

  it('calls the third and later ranks reeding, and the second rank on deeper layers a diamond', () => {
    expect(latticeKind(spec(3, 3))).toBe('reed');
    expect(latticeKind(spec(2, 3))).toBe('diamond');
    expect(latticeKind(spec(1, 2))).toBe('diamond');
  });
});
