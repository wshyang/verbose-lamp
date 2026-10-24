import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../session/context.js';
import { readLastPath, writeLastPath } from '../session/locationStore.js';

/**
 * ADR-019 — keeps the actor on the surface they were using when the page comes back.
 *
 * Restoring happens once, on the first render after the session is known, and only from the
 * root: a reload of /board reloads /board by itself, and an in-app visit to the front door is
 * a choice, not an accident. The guards still apply to whatever is restored, so a remembered
 * facilitator surface cannot let a participant in.
 */

/** Signed-out surfaces. Coming back to a sign-in form is never what the actor wanted. */
const PUBLIC_PATHS = ['/', '/signin', '/signup', '/staff/signin', '/admin/signin'];

export function useLocationMemory(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isLoading } = useSession();
  const hasRestored = useRef(false);
  const current = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (isLoading || hasRestored.current) return;
    hasRestored.current = true;
    const remembered = readLastPath();
    if (session === null || remembered === null || location.pathname !== '/') return;
    navigate(remembered, { replace: true });
  }, [isLoading, location.pathname, navigate, session]);

  useEffect(() => {
    if (session === null || PUBLIC_PATHS.includes(location.pathname)) return;
    writeLastPath(current);
  }, [current, location.pathname, session]);
}
