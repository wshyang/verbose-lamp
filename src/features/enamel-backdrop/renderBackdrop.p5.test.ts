// From PR #5 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKDROPS } from './palettes';
import { renderEnamelBackdrop } from './renderBackdrop';

const [emeraldSunburst_p5] = DEFAULT_BACKDROPS;
describe('renderEnamelBackdrop degenerate sizes', () => {
  it('renders a single pixel, where the gradient has no neighbours', () => {
    const pixel = renderEnamelBackdrop(emeraldSunburst_p5.spec, 1);
    expect(pixel.data).toHaveLength(4);
    expect(pixel.data[3]).toBe(255);
  });

  it('renders a single-band spec as one flat enamel', () => {
    const flat = renderEnamelBackdrop({ ...emeraldSunburst_p5.spec, bands: 1 }, 8);
    expect(flat.data).toHaveLength(8 * 8 * 4);
  });
});
