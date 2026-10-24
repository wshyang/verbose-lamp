import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionView } from '@psd/contracts';
import { fetchSession, signOut } from '../api/participants.js';
import type { SessionState } from '../session/context.js';
import { purgeAllCached } from '../storage/cacheStore.js';
import { clearSessionToken, readSessionToken } from '../session/tokenStore.js';
import {
  forgetRememberedSession,
  readRememberedSession,
  rememberSession,
} from '../session/sessionCache.js';

/**
 * Resolves the long-lived cookie session at boot (fds.md F4/F31/F42: sessions survive reloads
 * for the whole event day). A 401 means signed out, which is a normal state, not an error.
 *
 * `refresh` resolves with the session it read so a sign-in surface can confirm the cookie
 * before it navigates (ADR-015).
 */

// ADR-113 — this is a warm paint only, never an auth-cache hit: boot always fetches /session.
function readWarmSession(): SessionView | null {
  return readSessionToken() === null ? null : readRememberedSession();
}

function rememberWarmSession(session: SessionView): void {
  if (readSessionToken() !== null) rememberSession(session);
}

function forgetWarmSession(): void {
  forgetRememberedSession();
}

export function useSessionState(): SessionState {
  const warm = useRef(readWarmSession()).current;
  const [session, setSession] = useState<SessionView | null>(warm);
  const [isLoading, setIsLoading] = useState(warm === null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<SessionView | null> => {
    // A warm identity may paint, but it may never suppress this revalidation request.
    if (sessionRef.current === null) setIsLoading(true);
    const next = await fetchSession().catch(() => null);
    if (!isMounted.current) return next;
    if (next === null) forgetWarmSession();
    else rememberWarmSession(next);
    setSession(next);
    setIsLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Resolves `true` only when the SERVER confirmed the sign-out, and that distinction is the
   * whole point.
   *
   * The session cookie is HttpOnly (apps/api/src/lib/session.ts `sessionCookieOptions`), so no
   * amount of clearing here can revoke it — only the server's response can. This used to
   * swallow the failure and report success anyway: the token went, the UI said "signed out",
   * and the cookie stayed on the device as a complete credential, so the very next page load
   * presented it and signed the participant straight back in. That is the reported bug, and it
   * looks exactly like a Sign out button that does nothing.
   *
   * On failure the local caches are still emptied — a borrowed phone must not keep readable
   * data — but the session is left standing, because it IS still standing, and the caller is
   * told so.
   */
  const endSession = useCallback(async () => {
    const confirmed = await signOut().then(
      () => true,
      () => false,
    );
    if (!confirmed) {
      purgeAllCached();
      return false;
    }
    clearSessionToken();
    setSession(null);
    setIsLoading(false);
    return true;
  }, []);

  return { session, isLoading, refresh, endSession };
}
