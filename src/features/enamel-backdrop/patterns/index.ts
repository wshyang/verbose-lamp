import type { BackdropPattern, FieldFrame, PixelPoint } from '../types';
import { chevronField } from './chevron';
import { fanField } from './fan';
import { radianceField } from './radiance';
import { sunburstField } from './sunburst';
import { swirlField } from './swirl';

export { REFERENCE_GRID, centredOffset } from './space';
export { SUNBURST_TWIST_STEP } from './sunburst';
export { RADIANCE_SHAPES } from './radiance';
export { WAVE_FORMS } from './chevron';

function unhandledPattern(pattern: never): never {
  throw new Error(`Unhandled backdrop pattern: ${JSON.stringify(pattern)}`);
}

/**
 * The only switch over pattern kind. It is exhaustive, so a new kind that is not wired in
 * fails to compile (reference ADR-207). The field is continuous: band = floor(field) mod
 * bands, and the distance to the nearest integer is where the gold wires go.
 */
export function fieldAt(point: PixelPoint, frame: FieldFrame, pattern: BackdropPattern): number {
  switch (pattern.kind) {
    case 'sunburst':
      return sunburstField(point, frame, pattern);
    case 'radiance':
      return radianceField(point, frame, pattern);
    case 'chevron':
      return chevronField(point, frame, pattern);
    case 'swirl':
      return swirlField(point, frame, pattern);
    case 'fan':
      return fanField(point, frame, pattern);
    default:
      return unhandledPattern(pattern);
  }
}

export function bandOf(field: number, bands: number): number {
  const index = Math.floor(field);
  return ((index % bands) + bands) % bands;
}

/** Distance (in field units) to the nearest band boundary: 0 on a wire, 0.5 mid-band. */
export function edgeDistance(field: number): number {
  const fraction = field - Math.floor(field);
  return Math.min(fraction, 1 - fraction);
}
