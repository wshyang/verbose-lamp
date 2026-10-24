import { isVenueId, type VenueId } from '@psd/contracts';
import { useEffect, useState } from 'react';
import { applyVenueToDocument } from '../../themes/applyVenue.js';
import { themeFor } from '../../themes/index.js';
import type { VenueTheme } from '../../themes/types.js';
import { fetchVenue } from '../api/venue.js';
import { readStoredVenue, writeStoredVenue } from '../storage/venueStore.js';

/**
 * ADR-295 — which venue theme the app is wearing, and the act of putting it on.
 *
 * Three steps, in an order that matters:
 *   1. START from the last venue the server named (`venueStore`), so a returning phone paints
 *      the right palette on the first frame instead of flashing the default.
 *   2. APPLY it (`applyVenue.ts`): `<html data-venue>` selects the theme's CSS tokens, and the
 *      browser chrome colour follows the theme. `main.tsx` already did this before first render
 *      (ADR-298); the effect here re-applies when the server names a different venue. It is on `<html>`, not on `.theme-gameboy`, because the update banner
 *      and the photo dialog render outside that wrapper and the hall screen is outside it too.
 *   3. ASK the server once. A venue it names that this build has no theme for is ignored (a newer
 *      server than this bundle must not blank the app); a failed ask changes nothing (offline is
 *      normal on a beach). Only a recognised answer is kept.
 *
 * Not polled: the venue changes with a deployment, and the next page load picks it up.
 */

export function useVenue(): VenueTheme {
  const [venue, setVenue] = useState<VenueId>(readStoredVenue);
  const theme = themeFor(venue);

  useEffect(() => applyVenueToDocument(theme), [theme]);

  useEffect(() => {
    let isCurrent = true;
    fetchVenue()
      .then((answer) => {
        if (!isCurrent || !isVenueId(answer.venue)) return;
        writeStoredVenue(answer.venue);
        setVenue(answer.venue);
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, []);

  return theme;
}
