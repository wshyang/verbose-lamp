import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ActorType } from '@psd/contracts';
import { useSession } from '../../lib/session/context.js';

/**
 * Route guard. A signed-out visitor is sent to the sign-in surface for the area they asked
 * for; a signed-in actor of the wrong type is sent to their own home rather than shown a
 * console they may not use (fds.md §9.3).
 */

const HOME_BY_ACTOR: Record<ActorType, string> = {
  participant: '/home',
  facilitator: '/staff',
  superadmin: '/admin',
};

export function RequireActor(props: { actorType: ActorType; signInPath: string; children: ReactNode }) {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return <p className="loading">Loading…</p>;
  }
  if (!session) {
    return <Navigate to={props.signInPath} replace state={{ from: location.pathname }} />;
  }
  if (session.actorType !== props.actorType) {
    return <Navigate to={HOME_BY_ACTOR[session.actorType]} replace />;
  }
  return <>{props.children}</>;
}
