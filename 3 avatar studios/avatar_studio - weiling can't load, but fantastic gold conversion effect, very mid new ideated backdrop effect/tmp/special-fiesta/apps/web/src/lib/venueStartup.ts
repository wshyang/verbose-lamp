import { isVenueId } from '@psd/contracts';
import { applyVenueToDocument } from '../themes/applyVenue.js';
import { themeFor } from '../themes/index.js';
import type { VenueTheme } from '../themes/types.js';
import { fetchVenue } from './api/venue.js';
import { hasStoredVenue, readStoredVenue, writeStoredVenue } from './storage/venueStore.js';

/**
 * ADR-299 — which venue to wear on the very first frame.
 *
 * With one venue there was nothing to decide: the default was right for everyone. With two, a
 * phone that has never been here has nothing stored, so "the stored venue, else the default"
 * paints the DEFAULT venue first on a deployment that is somewhere else, starts loading that
 * venue's art (16 MB of it with `?backdrop=real`), and only then switches. The first thing a
 * brand-new participant at Tessensohn would see is Sentosa.
 *
 * So the rule has two cases:
 *   - A venue is stored: wear it now, never wait. A returning phone must not be held up by the
 *     network, and the hook confirms it from the server afterwards.
 *   - Nothing is stored: ask the server and WAIT for the answer, up to a short deadline, because
 *     a blank page for a moment is better than the wrong venue for a moment. A slow or absent
 *     server (offline on a beach is normal) falls back to the default at once or at the deadline.
 *
 * Only a recognised answer is ever stored; a guess is not.
 */

/** Longest a first-time visitor waits for the server to name the venue before the default wins. */
export const FIRST_VISIT_VENUE_WAIT_MS = 1500;

/** The venue the server names within the deadline, or null for slow, absent or unrecognised. */
async function askServer(): Promise<VenueTheme | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), FIRST_VISIT_VENUE_WAIT_MS);
  });
  const answer = fetchVenue()
    .then((view) => (isVenueId(view.venue) ? view.venue : null))
    .catch(() => null);
  try {
    const venue = await Promise.race([answer, deadline]);
    if (venue === null) return null;
    writeStoredVenue(venue);
    return themeFor(venue);
  } finally {
    clearTimeout(timer);
  }
}

/** Puts the right venue on `<html>` and resolves to its theme. Call before `createRoot(...).render`. */
export async function applyVenueBeforeFirstRender(): Promise<VenueTheme> {
  const theme = hasStoredVenue() ? themeFor(readStoredVenue()) : ((await askServer()) ?? themeFor(readStoredVenue()));
  applyVenueToDocument(theme);
  return theme;
}
