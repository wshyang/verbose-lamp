import { DEFAULT_VENUE_ID } from '@psd/contracts';
import { createContext, useContext } from 'react';
import { themeFor } from './index.js';
import type { VenueTheme } from './types.js';

/**
 * ADR-294 — the venue theme the participant app is wearing right now.
 *
 * The default is the default venue's theme, not `null`: a component rendered without a provider
 * (every existing test, a storybook, the hall screen before the provider mounts) still gets a
 * complete theme and draws exactly what it drew before venues existed. The provider only ever
 * *changes* the answer, so "no provider" can never mean "no theme".
 */
export const VenueContext = createContext<VenueTheme>(themeFor(DEFAULT_VENUE_ID));

export function useVenueTheme(): VenueTheme {
  return useContext(VenueContext);
}
