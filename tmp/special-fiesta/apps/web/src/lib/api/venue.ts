import type { VenueView } from '@psd/contracts';
import { apiGet } from './client.js';

/**
 * ADR-295 — which venue this deployment runs at. Public: asked before any session exists,
 * because the scene and the palette are drawn on Landing and Sign-in.
 */
export function fetchVenue(): Promise<VenueView> {
  return apiGet('/api/venue');
}
