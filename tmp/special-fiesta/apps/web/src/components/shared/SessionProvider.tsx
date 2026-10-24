import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useSessionState } from '../../lib/hooks/useSessionState.js';
import { requestNotificationPermission } from '../../lib/notify.js';
import { SessionContext } from '../../lib/session/context.js';

/** Resolves the cookie session once for the whole tree. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSessionState();

  // ADR-103 — ask for notification permission once somebody is actually signed in: they are
  // engaging with the app at that moment, which is the only polite time to ask.
  const isSignedIn = state.session !== null;
  useEffect(() => {
    if (isSignedIn) requestNotificationPermission();
  }, [isSignedIn]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
