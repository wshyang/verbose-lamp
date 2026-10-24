import { z } from 'zod';

/**
 * ADR-295 — which venue this deployment is running at.
 *
 * The id list is the one place a venue is declared. The web's theme registry is a
 * `Record<VenueId, VenueTheme>`, so adding an id here without writing the theme is a compile
 * error rather than a blank screen on the day (ADR-294).
 *
 * Ids are lowercase kebab-case because they become directory names (`themes/<id>/`), CSS
 * attribute values (`[data-venue='<id>']`) and URL path segments (`/themes/<id>/motifs/`), and
 * all three must agree on what a legal one looks like.
 */
export const VENUE_IDS = ['sentosa', 'tessensohn', 'kallang'] as const;

export type VenueId = (typeof VENUE_IDS)[number];

export const DEFAULT_VENUE_ID: VenueId = 'sentosa';

export const VenueIdSchema = z.enum(VENUE_IDS);

/** `GET /api/venue` — public, because the scene is drawn before anyone has signed in. */
export interface VenueView {
  venue: VenueId;
}

export function isVenueId(value: unknown): value is VenueId {
  return VenueIdSchema.safeParse(value).success;
}
