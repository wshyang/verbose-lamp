import { createContext, useContext } from 'react';
import type { SessionView } from '@psd/contracts';

/**
 * Session state is read by nearly every surface, so it is resolved once at the root and
 * shared. `null` session = signed out; `isLoading` guards the first paint.
 */

export interface SessionState {
  session: SessionView | null;
  isLoading: boolean;
  /**
   * Re-reads the cookie session and resolves with it. Sign-in surfaces await this before they
   * navigate: `null` means the browser did not keep the cookie, and sending the participant to
   * a guarded route would only bounce them back to the form with no explanation.
   */
  refresh: () => Promise<SessionView | null>;
  /** Resolves `true` only when the server confirmed it; `false` means still signed in. */
  endSession: () => Promise<boolean>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession must be used inside <SessionProvider>.');
  return state;
}

/**
 * ADR-103 — the null-safe read for hooks that only want to know WHO is looking, if anyone:
 * a harness without the provider (or a signed-out page) reads "nobody", never a crash.
 */
export function useSessionOrNull(): SessionView | null {
  return useContext(SessionContext)?.session ?? null;
}
