import { beforeEach, describe, expect, it } from 'vitest';
import {
  enqueueScan,
  markAttempt,
  newClientScanUuid,
  readQueue,
  removeFromQueue,
} from './scanQueue.js';

/**
 * ADR-009 — the offline queue is the only module allowed to touch localStorage, and it is the
 * one place where a corrupted store must never cost a facilitator their scans-in-hand.
 */

const STORAGE_KEY = 'psd.scanQueue.v1';

function draft(clientScanUuid: string, nickname = 'BeachBoss') {
  return {
    clientScanUuid,
    nickname,
    roundId: 'round-1',
    tierLabel: 'Award',
    clientTimestamp: '2026-09-29T02:05:00.000Z',
    activityName: 'Beach Volleyball Rally',
    pointValue: 15,
  };
}

describe('scanQueue', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts empty and mints a unique idempotency key per scan', () => {
    expect(readQueue()).toEqual([]);
    expect(newClientScanUuid()).not.toBe(newClientScanUuid());
  });

  it('initialises the retry bookkeeping and ignores a re-enqueued uuid', () => {
    enqueueScan(draft('uuid-1'));
    const twice = enqueueScan(draft('uuid-1', 'SomeoneElse'));
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({
      attempts: 0,
      lastError: null,
      isParked: false,
      nickname: 'BeachBoss',
    });
  });

  it('counts an attempt on the matching entry only, parking and un-parking as told', () => {
    enqueueScan(draft('uuid-1'));
    enqueueScan(draft('uuid-2', 'SandSprinter'));
    const after = markAttempt({
      clientScanUuid: 'uuid-2',
      error: 'Round not found.',
      shouldPark: true,
    });
    expect(after[0]).toMatchObject({ clientScanUuid: 'uuid-1', attempts: 0, lastError: null });
    expect(after[1]).toMatchObject({ attempts: 1, lastError: 'Round not found.', isParked: true });
    const again = markAttempt({
      clientScanUuid: 'uuid-2',
      error: 'Offline.',
      shouldPark: false,
    });
    expect(again[1]).toMatchObject({ attempts: 2, isParked: false });
  });

  it('removes a drained entry', () => {
    enqueueScan(draft('uuid-1'));
    enqueueScan(draft('uuid-2'));
    expect(removeFromQueue('uuid-1')).toHaveLength(1);
  });

  it('treats an entry persisted before ADR-093 (no flag) as not parked', () => {
    enqueueScan(draft('uuid-1'));
    const legacy = readQueue().map(({ isParked: _dropped, ...rest }) => rest);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    expect(readQueue()[0]).toMatchObject({ clientScanUuid: 'uuid-1', isParked: false });
  });

  it('recovers from a corrupted or foreign value in the store', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(readQueue()).toEqual([]);
    window.localStorage.setItem(STORAGE_KEY, '{"scan":1}');
    expect(readQueue()).toEqual([]);
    enqueueScan(draft('uuid-1'));
    expect(readQueue()).toHaveLength(1);
  });
});
