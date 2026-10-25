// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKDROPS } from './palettes';
import { renderEnamelPanel } from './renderBackdrop';

const [emeraldSunburst_p3] = DEFAULT_BACKDROPS;
describe('renderEnamelPanel edge cases', () => {
  it('paints a single band of enamel', () => {
    const single = { ...emeraldSunburst_p3.spec, bands: 1 };
    const panel = renderEnamelPanel(single, 16);
    expect(panel.image.width).toBe(16);
    expect(panel.image.data.length).toBe(16 * 16 * 4);
  });

  it('needs no neighbour on a one-pixel panel', () => {
    const panel = renderEnamelPanel(emeraldSunburst_p3.spec, 1);
    expect(panel.image.data.length).toBe(4);
    expect(panel.metal?.data.length).toBe(1);
  });
});
