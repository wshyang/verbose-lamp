import type { ScreenProfileView } from '@psd/contracts';
import { apiGet } from './client.js';

/**
 * ADR-160 — the projector's only question about itself: what am I, and what may I show?
 *
 * Carries the screen key like every other hall read (ADR-140); the server answers from the
 * key row it already loaded, so this is cheap enough to poll for eight hours.
 */
export function fetchScreenProfile(): Promise<ScreenProfileView> {
  return apiGet('/api/status/screen');
}
