import { useCallback, useEffect, useRef, useState } from 'react';
import { OfflineError } from '../api/client.js';
import { postScan } from '../api/stations.js';
import { markAttempt, readQueue, removeFromQueue } from '../offline/scanQueue.js';
import type { QueuedScan } from '../offline/scanQueue.js';
import { describeError } from './useAsyncData.js';

/**
 * S32 — the sync worker. Drains the offline scan queue whenever the browser reports it is
 * online, one entry at a time, relying on `client_scan_uuid` for idempotency (ADR-009): a
 * retry of an entry the server already accepted comes back as a duplicate and is dropped.
 */

const DRAIN_INTERVAL_MS = 15_000;

export interface SyncQueueState {
  items: QueuedScan[];
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncError: string | null;
  syncNow: () => void;
  /** ADR-093 — the S32 button: drains EVERYTHING, including entries parked by a refusal. */
  retryNow: () => void;
  refresh: () => void;
  discard: (clientScanUuid: string) => void;
}

type DrainVerdict =
  | { outcome: 'accepted' }
  /** Still offline: stop draining, the rest of the queue would fail the same way. */
  | { outcome: 'retry-later'; message: string }
  /** The server answered and refused: keep the entry visible on S32 with its reason. */
  | { outcome: 'rejected'; message: string };

function readOnlineFlag(): boolean {
  return navigator.onLine;
}

async function pushQueuedScan(entry: QueuedScan): Promise<DrainVerdict> {
  try {
    await postScan({
      nickname: entry.nickname,
      roundId: entry.roundId,
      tierLabel: entry.tierLabel,
      clientScanUuid: entry.clientScanUuid,
      clientTimestamp: entry.clientTimestamp,
    });
    return { outcome: 'accepted' };
  } catch (caught) {
    const message = describeError(caught);
    if (caught instanceof OfflineError) return { outcome: 'retry-later', message };
    return { outcome: 'rejected', message };
  }
}

/**
 * Walks the given entries oldest-first. A rejected entry is PARKED (ADR-093): it stays visible
 * on S32 with its reason but leaves every automatic drain, because replaying a refused payload
 * unchanged can only be refused again. Going offline stops the drain so the rest keep their
 * place in the queue. Returns the message to show, or null when nothing is blocking.
 */
async function drainQueue(
  setItems: (entries: QueuedScan[]) => void,
  entries: QueuedScan[],
): Promise<string | null> {
  for (const entry of entries) {
    const verdict = await pushQueuedScan(entry);
    if (verdict.outcome === 'accepted') {
      setItems(removeFromQueue(entry.clientScanUuid));
      continue;
    }
    setItems(
      markAttempt({
        clientScanUuid: entry.clientScanUuid,
        error: verdict.message,
        shouldPark: verdict.outcome === 'rejected',
      }),
    );
    if (verdict.outcome === 'retry-later') return verdict.message;
  }
  return null;
}

/** The queue also drains on a timer: a facilitator may never notice they were offline. */
function usePeriodicDrain(input: { syncNow: () => Promise<void>; refreshItems: () => void }): void {
  const { syncNow, refreshItems } = input;
  const refreshRef = useRef(refreshItems);
  refreshRef.current = refreshItems;

  useEffect(() => {
    const timer = setInterval(() => {
      refreshRef.current();
      if (readOnlineFlag() && readQueue().some((entry) => !entry.isParked)) void syncNow();
    }, DRAIN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [syncNow]);
}

export function useSyncQueue(): SyncQueueState {
  const [items, setItems] = useState<QueuedScan[]>(() => readQueue());
  const [isOnline, setIsOnline] = useState(readOnlineFlag);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const isDrainingRef = useRef(false);

  const refresh = useCallback(() => setItems(readQueue()), []);

  const drain = useCallback(async (input: { includeParked: boolean }) => {
    if (isDrainingRef.current) return;
    isDrainingRef.current = true;
    setIsSyncing(true);
    setLastSyncError(null);
    try {
      const entries = input.includeParked
        ? readQueue()
        : readQueue().filter((entry) => !entry.isParked);
      setLastSyncError(await drainQueue(setItems, entries));
    } finally {
      isDrainingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  const syncNow = useCallback(() => drain({ includeParked: false }), [drain]);
  const retryNow = useCallback(() => drain({ includeParked: true }), [drain]);

  const markOnline = useCallback(() => setIsOnline(true), []);
  const markOffline = useCallback(() => setIsOnline(false), []);
  useConnectivityDrain({ syncNow, onOnline: markOnline, onOffline: markOffline });
  usePeriodicDrain({ syncNow, refreshItems: () => setItems(readQueue()) });

  return {
    items,
    pendingCount: items.length,
    isOnline,
    isSyncing,
    lastSyncError,
    syncNow: () => void syncNow(),
    retryNow: () => void retryNow(),
    refresh,
    discard: (clientScanUuid: string) => setItems(removeFromQueue(clientScanUuid)),
  };
}

/** Browsers announce reconnection; that is the moment to flush the beach's backlog. */
function useConnectivityDrain(input: {
  syncNow: () => Promise<void>;
  onOnline: () => void;
  onOffline: () => void;
}): void {
  const { syncNow, onOnline, onOffline } = input;
  useEffect(() => {
    const goOnline = () => {
      onOnline();
      void syncNow();
    };
    const goOffline = () => onOffline();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [onOffline, onOnline, syncNow]);
}
