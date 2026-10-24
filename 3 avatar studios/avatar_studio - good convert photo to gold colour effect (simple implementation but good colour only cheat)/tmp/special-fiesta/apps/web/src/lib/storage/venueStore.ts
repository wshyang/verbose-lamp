import { DEFAULT_VENUE_ID, isVenueId, type VenueId } from '@psd/contracts';
import { readItem, writeItem } from './localStore.js';

/**
 * ADR-295 — the venue this browser last heard the server name, kept so the next page load can
 * wear the right theme on the first paint instead of flashing the default while it asks.
 *
 * A cache and nothing more: the server is the truth, and `useVenue` overwrites this the moment
 * it hears. A stored value that is no longer a known venue (an id retired between deploys, a
 * hand-edited key) is ignored rather than trusted, because a theme the build does not contain
 * would render nothing at all.
 *
 * This module owns `psd.venue.v1` — no one else reads or writes that key (ADR-019).
 */

const VENUE_KEY = 'psd.venue.v1';

/**
 * Whether this browser holds a venue it recognises. `readStoredVenue` cannot say: it answers the
 * default for "nothing stored" and for "stored the default" alike, and startup has to tell a
 * returning phone (wear it now) from a first visit (ask the server, ADR-299).
 */
export function hasStoredVenue(): boolean {
  return isVenueId(readItem(VENUE_KEY));
}

/** The last venue the server named, or the default when there is none or it is unrecognised. */
export function readStoredVenue(): VenueId {
  const kept = readItem(VENUE_KEY);
  return isVenueId(kept) ? kept : DEFAULT_VENUE_ID;
}

/** Only a change is written, so confirming the same venue on every page load touches no storage. */
export function writeStoredVenue(venue: VenueId): void {
  if (readItem(VENUE_KEY) !== venue) writeItem(VENUE_KEY, venue);
}
