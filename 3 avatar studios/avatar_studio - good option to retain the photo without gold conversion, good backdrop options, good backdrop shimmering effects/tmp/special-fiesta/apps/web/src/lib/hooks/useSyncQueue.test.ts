import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { scanFixture } from '../../test-utils/fixtures.js';
import { enqueueScan, markAttempt, readQueue } from '../offline/scanQueue.js';
import { useSyncQueue } from './useSyncQueue.js';

let stub: FetchStub;

beforeEach(() => localStorage.clear());
afterEach(() => stub?.restore());

function queueOne(clientScanUuid: string) {
  enqueueScan({
    nickname: 'BeachBoss',
    roundId: 'round-1',
    tierLabel: 'Award',
    clientScanUuid,
    clientTimestamp: '2026-09-29T02:05:00.000Z',
    activityName: 'Beach Volleyball Rally',
    pointValue: 15,
  });
}

describe('useSyncQueue', () => {
  it('drains queued scans and removes the ones the server accepted', async () => {
    queueOne('uuid-1');
    queueOne('uuid-2');
    stub = installFetchStub({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
    });
    const { result } = renderHook(() => useSyncQueue());

    expect(result.current.pendingCount).toBe(2);
    await act(async () => result.current.syncNow());

    await waitFor(() => expect(readQueue()).toHaveLength(0));
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(2);
  });

  it('drops an entry the server already recorded (idempotent replay)', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({
      'POST /api/fringe/scans': { status: 200, body: { scan: scanFixture, duplicate: true } },
    });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => result.current.syncNow());

    await waitFor(() => expect(readQueue()).toHaveLength(0));
  });

  it('keeps the scan and records the failure when the network is still down', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({ 'POST /api/fringe/scans': { offline: true } });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => result.current.syncNow());

    expect(readQueue()).toHaveLength(1);
    await waitFor(() => expect(result.current.lastSyncError).toContain("Can't reach Active Day"));
  });

  it('keeps a rejected scan visible with its error so it can be dealt with by hand', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({
      'POST /api/fringe/scans': {
        status: 404,
        body: { error: { message: 'Nickname not found — is this participant signed up?' } },
      },
    });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => result.current.syncNow());

    const [entry] = readQueue();
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toContain('Nickname not found');
    expect(entry?.isParked).toBe(true);
    expect(result.current.pendingCount).toBe(1);
  });

  it('parks a refused entry: auto drains skip it, only the manual retry resends it (ADR-093)', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({
      'POST /api/fringe/scans': {
        status: 404,
        body: { error: { message: 'Nickname not found — is this participant signed up?' } },
      },
    });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => result.current.syncNow());
    await waitFor(() => expect(readQueue()[0]?.isParked).toBe(true));
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1);

    // The automatic drain walks past the parked entry without touching the network.
    await act(async () => result.current.syncNow());
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1);

    // The S32 button is the explicit human decision, so it resends even a parked entry.
    await act(async () => result.current.retryNow());
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(2);
    expect(readQueue()[0]?.attempts).toBe(2);
  });

  it('un-parks an entry whose manual retry went offline, so auto drains resume', async () => {
    queueOne('uuid-1');
    markAttempt({ clientScanUuid: 'uuid-1', error: 'Nickname not found', shouldPark: true });
    stub = installFetchStub({ 'POST /api/fringe/scans': { offline: true } });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => result.current.retryNow());

    await waitFor(() => expect(readQueue()[0]?.isParked).toBe(false));
    expect(readQueue()[0]?.attempts).toBe(2);
  });

  it('flushes the backlog as soon as the browser announces it is back online', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
    });
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(readQueue()).toHaveLength(0));
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(result.current.isOnline).toBe(false));
  });

  it('drains on its own timer, and never twice at once', async () => {
    queueOne('uuid-1');
    stub = installFetchStub({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
    });
    const { result } = renderHook(() => useSyncQueue());

    // Two taps in the same tick must still produce a single pass over the queue.
    await act(async () => {
      result.current.syncNow();
      result.current.syncNow();
    });
    await waitFor(() => expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1));
  });

  it('keeps draining on a timer while the station is left unattended', async () => {
    vi.useFakeTimers();
    try {
      queueOne('uuid-1');
      stub = installFetchStub({
        'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
      });
      renderHook(() => useSyncQueue());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1);

      // With the queue empty the timer keeps ticking without calling the API again.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(16_000);
      });
      expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
