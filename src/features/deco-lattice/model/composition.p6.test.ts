// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { buildDecoLattice } from './composition';
import { specsToLayerPaths } from './latticeSvg';

describe('buildDecoLattice', () => {
  it('defaults the seed and the recipe depth', () => {
    const explicit = buildDecoLattice({ mode: 'frame', hw: 1.6, hh: 1, seed: 1925, level: 4 });
    const defaults = buildDecoLattice({ mode: 'frame', hw: 1.6, hh: 1 });
    expect(specsToLayerPaths(defaults.specs)).toEqual(specsToLayerPaths(explicit.specs));
  });
});
