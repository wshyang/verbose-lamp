// From PR #4 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKDROPS } from './palettes';
import { renderEnamelPanel } from './renderBackdrop';

const [emeraldSunburst_p4] = DEFAULT_BACKDROPS;
describe('degenerate panels', () => {
  it('renders a single-pixel panel without a neighbour to compare against', () => {
    // A 1 px panel has no left or right neighbour, so the gradient falls back to 0
    // instead of reading outside the plane.
    const panel = renderEnamelPanel({ ...emeraldSunburst_p4.spec, bands: 1 }, 1);
    expect(panel.image.width).toBe(1);
    expect(panel.image.data).toHaveLength(4);
    expect(panel.metal.data).toHaveLength(1);
  });

  it('renders a single-band panel at the ramp start', () => {
    const panel = renderEnamelPanel({ ...emeraldSunburst_p4.spec, bands: 1 }, 12);
    expect(panel.image.data.some((value) => value > 0)).toBe(true);
  });
});
