import type { MotifName } from '../lib/motifs.js';
import type { VenueTheme } from './types.js';

/**
 * ADR-297 — where a sprite lives for a venue: that venue's directory, plus the content stamp that
 * makes a redrawn sprite impossible to serve stale (ADR-067). The same name is a different file
 * in every venue, drawn in its own palette, which is why a URL needs the theme and not just the
 * name.
 */
export function motifUrl(theme: VenueTheme, name: MotifName): string {
  return `${theme.motifBase}/${name}.svg?v=${theme.motifVersion}`;
}
