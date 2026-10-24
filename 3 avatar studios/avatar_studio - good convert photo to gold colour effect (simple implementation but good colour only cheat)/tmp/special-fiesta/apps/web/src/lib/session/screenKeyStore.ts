/**
 * ADR-140/141 — the hall screen's credential, which is not a session.
 *
 * The projector is not a person: nobody signs it in, nobody is watching when its credential
 * expires, and it must survive the laptop being closed at lunch and opened again at three.
 * So it holds a key rather than a session token — minted by a superadmin, revocable from the
 * admin page, good for exactly the handful of public reads the screen renders (ADR-140).
 *
 * The key arrives once, in the URL the organiser pastes into the projector's browser
 * (`/screen?key=…`), and is immediately moved out of the address bar into storage: a URL left
 * on screen behind a stuck slide is a credential on a wall in front of two hundred people,
 * and a reload must not need the organiser to find that email again.
 *
 * Which carrier it rides is deliberately read from the session store rather than learned
 * again here. ADR-016 established that header-stripping is a property of the deployment, not
 * of the credential, so whatever the app has already discovered about this tunnel applies to
 * the screen too.
 */

import { readItem, removeItem, writeItem } from '../storage/localStore.js';
import { readSessionCarrier, type SessionCarrier } from './tokenStore.js';

const SCREEN_KEY = 'psd.screenKey.v1';

/** The query parameter the organiser's URL carries, and the one the API accepts (ADR-140). */
export const SCREEN_KEY_PARAM = 'key';

export function readScreenKey(): string | null {
  return readItem(SCREEN_KEY);
}

export function writeScreenKey(key: string): void {
  writeItem(SCREEN_KEY, key);
}

export function clearScreenKey(): void {
  removeItem(SCREEN_KEY);
}

export function screenKeyCarrier(): SessionCarrier {
  return readSessionCarrier();
}

/**
 * Takes the key out of the address bar and keeps it.
 *
 * Returns the key now in force, which is the stored one when the URL carries none — that is
 * the ordinary case on every reload after the first. An explicit `?key=` always wins, so
 * pasting a freshly minted URL over a revoked one is all the recovery procedure there is.
 */
export function adoptScreenKey(search: string): string | null {
  const fromUrl = new URLSearchParams(search).get(SCREEN_KEY_PARAM);
  if (fromUrl !== null && fromUrl.trim() !== '') writeScreenKey(fromUrl.trim());
  return readScreenKey();
}
