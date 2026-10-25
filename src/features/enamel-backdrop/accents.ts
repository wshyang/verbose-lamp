import type { EnamelPalette } from './types';

/**
 * The palette's accent stops, or none. A two-tone palette is legal (the classic
 * families have no accents), so callers never have to handle `undefined`.
 */
export function accentsOf(palette: EnamelPalette): readonly string[] {
  return palette.accents ?? [];
}
