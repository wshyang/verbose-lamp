import { readItem, writeItem } from '../storage/localStore.js';

/**
 * ADR-263 — the value this browser offers the load balancer as its sticky-session key.
 *
 * Northflank's consistent-hashing mode can hash a custom request header; the API client
 * sends this value as `x-sticky-session` on every fetch it makes, so one browser's traffic
 * keeps landing on one instance (the chat and status buses live in instance memory).
 *
 * The value is a random id drawn once per browser and kept — deliberately NOT the session
 * token: it names the browser, not the person, so it survives sign-out, can ride requests
 * made before anyone signs in (including the sign-in itself), and is worthless to anyone
 * who reads it in a log. Storage is reached through localStore, the one owner (ADR-019);
 * a browser that refuses storage still gets a stable value for the life of the page.
 */

const STICKY_KEY = 'psd.stickySession.v1';

/** The id currently drawn for this browser, kept in memory in step with the store. */
let drawnThisPage: string | null = null;

function drawId(): string {
  return crypto.randomUUID();
}

/**
 * This browser's sticky-session id: the kept one, or a new one drawn and kept now.
 * Calling it again always gives the same answer, which is the whole point of it.
 */
export function readStickySessionId(): string {
  if (drawnThisPage !== null) return drawnThisPage;
  const kept = readItem(STICKY_KEY);
  if (kept !== null && kept !== '') {
    drawnThisPage = kept;
    return kept;
  }
  const drawn = drawId();
  drawnThisPage = drawn;
  writeItem(STICKY_KEY, drawn);
  return drawn;
}
