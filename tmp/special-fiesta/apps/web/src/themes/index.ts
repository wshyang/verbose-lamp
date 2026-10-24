import { DEFAULT_VENUE_ID, type VenueId } from '@psd/contracts';
import { SENTOSA } from './sentosa/index.js';
import { TESSENSOHN } from './tessensohn/index.js';
import { KALLANG } from './kallang/index.js';
import type { VenueTheme } from './types.js';

/**
 * ADR-294 — every venue the participant app can wear.
 *
 * `Record<VenueId, VenueTheme>` is the whole mechanism: add an id to `VENUE_IDS` in the contracts
 * and this object stops compiling until the theme exists, so a venue the server can name but the
 * build cannot draw is a build failure rather than a blank screen on the day.
 *
 * This file is the ONLY importer of `./<id>/` (standards rule `venue-isolation`); everything else
 * reaches a theme through `themeFor`, the hook, or a role.
 */
export const THEMES: Readonly<Record<VenueId, VenueTheme>> = {
  sentosa: SENTOSA,
  tessensohn: TESSENSOHN,
  kallang: KALLANG,
};

/** The theme for an id, or the default venue's if the id is somehow unknown at runtime. */
export function themeFor(id: VenueId): VenueTheme {
  return THEMES[id] ?? THEMES[DEFAULT_VENUE_ID];
}

export { MOTIF_ROLES } from './types.js';
export type { MotifRole, VenueCopy, VenueTheme } from './types.js';
