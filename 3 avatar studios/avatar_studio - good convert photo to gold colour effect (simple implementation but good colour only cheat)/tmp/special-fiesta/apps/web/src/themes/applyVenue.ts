import { readStoredVenue } from '../lib/storage/venueStore.js';
import { themeFor } from './index.js';
import type { VenueTheme } from './types.js';

/**
 * ADR-295 / ADR-298 — putting a venue on the page.
 *
 * Two things carry the venue: `<html data-venue>` selects the theme's CSS tokens, and the
 * `theme-color` meta paints the browser's own chrome. Both belong on the document, not on a
 * React subtree, because the update banner, the photo dialog and the hall screen render outside
 * `.theme-gameboy`.
 *
 * Lives here, not in the hook, so `main.tsx` can call it BEFORE React renders. In the hook it ran
 * in a `useEffect`, which is after the first frame: invisible with one venue, and a flash of the
 * wrong venue's colours on a returning phone with two.
 */

export function applyVenueToDocument(theme: VenueTheme): void {
  document.documentElement.dataset['venue'] = theme.id;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta !== null) meta.content = theme.metaThemeColor;
}

/** Applies whichever venue this browser last heard of (or the default) and returns its theme. */
export function applyStoredVenue(): VenueTheme {
  const theme = themeFor(readStoredVenue());
  applyVenueToDocument(theme);
  return theme;
}
