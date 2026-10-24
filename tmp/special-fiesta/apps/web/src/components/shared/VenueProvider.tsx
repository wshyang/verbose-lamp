import type { ReactNode } from 'react';
import { useVenue } from '../../lib/hooks/useVenue.js';
import { VenueContext } from '../../themes/venueContext.js';

/**
 * ADR-294 / ADR-295 — puts the venue theme on the page and makes it available to every
 * participant component. Mounted once, above the router, so the hall screen, the update banner
 * and the photo dialog all follow it, not only the pages under `.theme-gameboy`.
 */
export function VenueProvider({ children }: { children: ReactNode }) {
  const theme = useVenue();
  return <VenueContext.Provider value={theme}>{children}</VenueContext.Provider>;
}
