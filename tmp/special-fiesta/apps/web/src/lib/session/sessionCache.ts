import type { SessionView } from '@psd/contracts';
import { readItem, removeItem, writeItem } from '../storage/localStore.js';

/**
 * ADR-112 — the remembered identity: who this phone was last signed in as.
 *
 * This module owns `psd.session.v1` and nothing else owns it (ADR-019). It exists because
 * the session was the one read every other cache waited on: `/api/auth/session` is a
 * round trip, `RequireActor` shows "Loading…" until it answers, and until it answers the
 * device caches cannot even be *read* — every entry is namespaced by actor id (ADR-112),
 * so an unknown actor means an unusable cache. A returning participant therefore paid a
 * spinner AND a cold cache on every page load, which is what made the remembered chat
 * tails land without ever firing.
 *
 * The policy is deliberately the weakest one in the cache family — **warm start, never a
 * TTL skip**:
 *
 *   - the remembered session seeds the FIRST PAINT, so the shell and the actor-keyed
 *     caches are usable immediately;
 *   - `/api/auth/session` is still requested every single boot, and its answer always
 *     wins. No authorization decision is ever served from this file alone.
 *
 * That ordering matters. Caching an auth *decision* would mean a revoked session kept
 * working offline; caching the *last answer* means a revoked session paints a shell for
 * the few hundred milliseconds before the server contradicts it, while every byte behind
 * that shell still 401s. The honest cost is a brief flash of a surface the viewer may no
 * longer enter; the honest gain is that the whole app stops opening on a spinner.
 *
 * It dies with the credential: `tokenStore` forgets this the moment a token changes or is
 * cleared, so a handed-over phone never warm-starts into somebody else's name.
 */

const SESSION_KEY = 'psd.session.v1';

/** The last answer `/api/auth/session` gave, or null if this device has none to offer. */
export function readRememberedSession(): SessionView | null {
  const raw = readItem(SESSION_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as SessionView;
    // A shape that predates a contract change is discarded, never migrated (ADR-112).
    return typeof parsed?.actorType === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function rememberSession(session: SessionView): void {
  writeItem(SESSION_KEY, JSON.stringify(session));
}

export function forgetRememberedSession(): void {
  removeItem(SESSION_KEY);
}
