import type { ReactNode } from 'react';
import { useSyncQueue } from '../../lib/hooks/useSyncQueue.js';
import { SyncContext } from '../../lib/session/syncContext.js';

/** One offline-scan drainer per tab, shared by the station console and S32. */
export function SyncProvider({ children }: { children: ReactNode }) {
  const state = useSyncQueue();
  return <SyncContext.Provider value={state}>{children}</SyncContext.Provider>;
}
