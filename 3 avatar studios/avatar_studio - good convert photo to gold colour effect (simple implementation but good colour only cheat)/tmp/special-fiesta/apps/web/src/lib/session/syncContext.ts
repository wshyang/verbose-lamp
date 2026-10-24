import { createContext, useContext } from 'react';
import type { SyncQueueState } from '../hooks/useSyncQueue.js';

/**
 * One sync worker per browser tab: the facilitator header badge and S32 must agree on the
 * pending count, so they read the same instance instead of each mounting their own drainer.
 */

export const SyncContext = createContext<SyncQueueState | null>(null);

export function useSync(): SyncQueueState {
  const state = useContext(SyncContext);
  if (!state) throw new Error('useSync must be used inside <SyncProvider>.');
  return state;
}
