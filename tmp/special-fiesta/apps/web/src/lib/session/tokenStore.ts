/**
 * ADR-016 — the session token, kept where the cookie cannot go.
 *
 * Embedded in another site's page, a browser treats this app as a third party and refuses to
 * store its cookie however the server labels it. The same opaque token is therefore also held
 * here and sent on every request. It travels in a header by default; if something between the
 * page and the API drops that header, the client learns to put it in the query string instead
 * and remembers the choice, because it is a property of the deployment, not of the session.
 *
 * Storage itself is reached through lib/storage/localStore.ts, which owns every quirk of an
 * unreliable store (`npm run standards` enforces that there is exactly one such owner).
 */

import { readItem, removeItem, writeItem } from '../storage/localStore.js';
import { purgeAllCached } from '../storage/cacheStore.js';
import { forgetRememberedSession } from './sessionCache.js';

const TOKEN_KEY = 'psd.sessionToken.v1';
const CARRIER_KEY = 'psd.sessionCarrier.v1';

/** Where the token rides: a private request header, or the query string as a last resort. */
export type SessionCarrier = 'header' | 'query';

export interface SessionCredential {
  token: string;
  carrier: SessionCarrier;
}

export function readSessionToken(): string | null {
  return readItem(TOKEN_KEY);
}

export function readSessionCarrier(): SessionCarrier {
  return readItem(CARRIER_KEY) === 'query' ? 'query' : 'header';
}

/** The credential to send with a request, or null when nobody is signed in on this page. */
export function readSessionCredential(): SessionCredential | null {
  const token = readSessionToken();
  return token === null ? null : { token, carrier: readSessionCarrier() };
}

export function writeSessionToken(token: string): void {
  // ADR-112 — a NEW session means a possibly different person: the data cache dies here,
  // and so does the remembered identity that keys it.
  if (readItem(TOKEN_KEY) !== token) {
    purgeAllCached();
    forgetRememberedSession();
  }
  writeItem(TOKEN_KEY, token);
}

/** Recorded once the client discovers which carrier actually reaches the API. */
export function writeSessionCarrier(carrier: SessionCarrier): void {
  writeItem(CARRIER_KEY, carrier);
}

export function clearSessionToken(): void {
  removeItem(TOKEN_KEY);
  // ADR-112 — sign-out hands the phone over clean: no cached reads, no remembered name.
  purgeAllCached();
  forgetRememberedSession();
}
