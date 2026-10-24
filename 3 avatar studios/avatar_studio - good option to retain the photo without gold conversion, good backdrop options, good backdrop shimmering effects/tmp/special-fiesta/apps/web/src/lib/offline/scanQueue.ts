import type { ScanPayload } from '../api/stations.js';
import { readItem, writeItem } from '../storage/localStore.js';

/**
 * DC-004 / ADR-009 — the offline scan queue. It owns this key and nothing else may read or
 * write it (AGENTS-frontend.md §6); the storage mechanics themselves live in
 * lib/storage/localStore.ts, which keeps a queued scan alive even on a device whose storage
 * refuses to co-operate. Entries carry the client-minted idempotency key, so replaying the
 * queue can never double-award.
 */

const STORAGE_KEY = 'psd.scanQueue.v1';

/**
 * ADR-009 — the idempotency key is minted here, in the module that owns the retry contract,
 * so a queued scan and its replay can never disagree about which scan they are.
 */
export function newClientScanUuid(): string {
  return crypto.randomUUID();
}

export interface QueuedScan extends ScanPayload {
  activityName: string;
  pointValue: number;
  attempts: number;
  lastError: string | null;
  /**
   * ADR-093 — the server answered and REFUSED this entry, so replaying it unchanged can only
   * produce the same refusal. A parked entry is excluded from every automatic drain (timer,
   * reconnect) and resent only when a human presses the retry button on S32.
   */
  isParked: boolean;
}

function readRaw(): QueuedScan[] {
  const raw = readItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QueuedScan[];
    if (!Array.isArray(parsed)) return [];
    // Entries persisted before ADR-093 have no flag; absent means never refused, so not parked.
    return parsed.map((item) => ({ ...item, isParked: item.isParked === true }));
  } catch {
    return [];
  }
}

function writeRaw(entries: QueuedScan[]): void {
  writeItem(STORAGE_KEY, JSON.stringify(entries));
}

export function readQueue(): QueuedScan[] {
  return readRaw();
}

/** The retry bookkeeping belongs to the queue, so no caller can enqueue a broken counter. */
export type QueuedScanDraft = Omit<QueuedScan, 'attempts' | 'lastError' | 'isParked'>;

export function enqueueScan(draft: QueuedScanDraft): QueuedScan[] {
  const existing = readRaw();
  const isKnown = existing.some((item) => item.clientScanUuid === draft.clientScanUuid);
  const next = isKnown
    ? existing
    : [...existing, { ...draft, attempts: 0, lastError: null, isParked: false }];
  writeRaw(next);
  return next;
}

export function removeFromQueue(clientScanUuid: string): QueuedScan[] {
  const next = readRaw().filter((item) => item.clientScanUuid !== clientScanUuid);
  writeRaw(next);
  return next;
}

/**
 * `shouldPark` is the drain's verdict on the failure: true when the server REFUSED the entry
 * (auto-retry would repeat the refusal, ADR-093), false when the attempt never reached the
 * server (offline — the entry stays eligible for the next automatic drain). A manual retry
 * that goes offline therefore un-parks: the next verdict is unknown again.
 */
export function markAttempt(input: {
  clientScanUuid: string;
  error: string;
  shouldPark: boolean;
}): QueuedScan[] {
  const next = readRaw().map((item) =>
    item.clientScanUuid === input.clientScanUuid
      ? { ...item, attempts: item.attempts + 1, lastError: input.error, isParked: input.shouldPark }
      : item,
  );
  writeRaw(next);
  return next;
}

