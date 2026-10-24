import { useCallback } from 'react';
import { reassignParticipantCluster } from '../api/admin.js';
import { useAction } from './useAction.js';

/**
 * ADR-172 — moving one participant between clusters.
 *
 * Thin, but its own hook so the panel stays a rendering concern and the reload-on-success is
 * stated once: the detail page shows the cluster in two places, and a move that updated only
 * the one the user pressed would look like it had half worked.
 */
export function useParticipantClusterMove(participantId: string, onMoved: () => void) {
  const action = useAction(reassignParticipantCluster, onMoved);
  const run = useCallback(
    (toClusterCode: string) => void action.run({ participantId, toClusterCode }),
    [action, participantId],
  );
  return { run, isPending: action.isPending, error: action.error };
}
