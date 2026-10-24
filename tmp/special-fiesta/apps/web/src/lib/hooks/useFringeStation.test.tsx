import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { messages } from '@psd/contracts';
import { SyncProvider } from '../../components/shared/SyncProvider.js';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../../test-utils/fetchStub.js';
import {
  activityFixture,
  participantFixture,
  roundFixture,
  scanFixture,
} from '../../test-utils/fixtures.js';
import { readQueue } from '../offline/scanQueue.js';
import { useFringeStation } from './useFringeStation.js';
import { fringeStationRoutes } from '../../test-utils/ambientRoutes.js';

let stub: FetchStub;

beforeEach(() => localStorage.clear());
afterEach(() => stub?.restore());

function wrapper({ children }: { children: ReactNode }) {
  return <SyncProvider>{children}</SyncProvider>;
}

function mount(routes: RouteTable) {
  stub = installFetchStub({
    ...fringeStationRoutes(),
    'GET /api/fringe/activities/activity-1': { body: { activity: activityFixture } },
    'GET /api/fringe/rounds/round-1/scans': { body: { items: [scanFixture] } },
    ...routes,
  });
  return renderHook(() => useFringeStation('activity-1'), { wrapper });
}

describe('useFringeStation', () => {
  it('loads the open round and its scan log', async () => {
    const { result } = mount({});
    await waitFor(() => expect(result.current.round?.roundNumber).toBe(1));
    expect(result.current.scanCount).toBe(1);
  });

  it('awards points online and reports the nickname back', async () => {
    const { result } = mount({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    expect(result.current.outcome?.kind).toBe('awarded');
    expect(result.current.outcome?.message).toBe('✓ BeachBoss +15 pts');
    // ADR-138 — the confirmation carries the handle for taking this exact scan back.
    expect(result.current.outcome?.undo?.scanId).toBe(scanFixture.id);
  });

  it('queues the scan offline with the activity snapshot needed to confirm locally', async () => {
    const { result } = mount({ 'POST /api/fringe/scans': { offline: true } });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    expect(result.current.outcome?.kind).toBe('queued');
    expect(readQueue()[0]?.pointValue).toBe(15);
  });

  /*
   * ADR-138 — the offline branch first, because it is the one that must NOT touch the network:
   * a queued scan exists nowhere but this device, so dropping the queue entry IS the undo.
   */
  it('undoes a queued scan by dropping the queue entry, without posting anything', async () => {
    const { result } = mount({ 'POST /api/fringe/scans': { offline: true } });
    await waitFor(() => expect(result.current.round).not.toBeNull());
    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });
    expect(readQueue()).toHaveLength(1);

    await act(async () => {
      await result.current.undoLast();
    });

    expect(readQueue()).toHaveLength(0);
    expect(result.current.outcome?.kind).toBe('undone');
    expect(stub.callsTo('POST /api/fringe/scans/scan-1/undo')).toHaveLength(0);
  });

  it('undoes a scan the server already took, by id', async () => {
    const { result } = mount({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
      'POST /api/fringe/scans/scan-1/undo': {
        body: { scan: { ...scanFixture, isVoided: true, undoneAt: '2026-09-29T02:05:06.000Z' } },
      },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());
    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    await act(async () => {
      await result.current.undoLast();
    });

    expect(stub.callsTo('POST /api/fringe/scans/scan-1/undo')).toHaveLength(1);
    expect(result.current.outcome).toEqual({ kind: 'undone', message: messages.scanUndone });
  });

  it('shows the server’s refusal when the ten seconds have already gone', async () => {
    const { result } = mount({
      'POST /api/fringe/scans': { status: 201, body: { scan: scanFixture, duplicate: false } },
      'POST /api/fringe/scans/scan-1/undo': {
        status: 409,
        body: { error: { message: messages.scanUndoExpired } },
      },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());
    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });
    await act(async () => {
      await result.current.undoLast();
    });

    expect(result.current.outcome).toEqual({
      kind: 'rejected',
      message: messages.scanUndoExpired,
    });
  });

  // A refused scan never happened, so there is nothing to take back and no request to make.
  it('offers no undo for an outcome that awarded nothing', async () => {
    const { result } = mount({});
    await waitFor(() => expect(result.current.round).not.toBeNull());
    await act(async () => {
      await result.current.submitScan('   ');
    });
    expect(result.current.outcome?.undo).toBeUndefined();

    let taken: unknown = 'unset';
    await act(async () => {
      taken = await result.current.undoLast();
    });
    expect(taken).toBeNull();
    expect(result.current.outcome?.kind).toBe('rejected');
  });

  it('refuses to scan when no round is open', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': {
        body: { activity: { ...activityFixture, currentRound: null } },
      },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.activity).not.toBeNull());

    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    expect(result.current.outcome).toEqual({ kind: 'rejected', message: messages.noOpenRound });
  });

  it('refuses an empty nickname before it reaches the API', async () => {
    const { result } = mount({});
    await waitFor(() => expect(result.current.round).not.toBeNull());

    await act(async () => {
      await result.current.submitScan('   ');
    });

    expect(result.current.outcome?.kind).toBe('rejected');
    expect(stub.callsTo('POST /api/fringe/scans')).toHaveLength(0);
  });

  // ADR-088 — the number lookup's refusals, cheapest first: no round, bad digits, no link.
  it('refuses a lookup before the activity has even loaded', async () => {
    const { result } = mount({});

    // Deliberately no waitFor: the station is still loading, so there is nothing to award into.
    let found: unknown = 'unset';
    await act(async () => {
      found = await result.current.lookupNumber('0742');
    });

    expect(found).toBeNull();
    expect(result.current.outcome).toEqual({ kind: 'rejected', message: messages.noOpenRound });
  });

  it('refuses a lookup when the activity has no round at all', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': {
        body: { activity: { ...activityFixture, currentRound: null } },
      },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.activity).not.toBeNull());

    await act(async () => {
      await result.current.lookupNumber('0742');
    });

    expect(result.current.outcome).toEqual({ kind: 'rejected', message: messages.noOpenRound });
  });

  it('refuses a lookup against a round that is not open', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': {
        body: {
          activity: { ...activityFixture, currentRound: { ...roundFixture, status: 'ended' } },
        },
      },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.activity).not.toBeNull());

    await act(async () => {
      await result.current.lookupNumber('0742');
    });

    expect(result.current.outcome).toEqual({ kind: 'rejected', message: messages.noOpenRound });
  });

  it('refuses digits that are not a 4-digit number', async () => {
    const { result } = mount({});
    await waitFor(() => expect(result.current.round).not.toBeNull());

    await act(async () => {
      await result.current.lookupNumber('074');
    });

    expect(result.current.outcome).toEqual({
      kind: 'rejected',
      message: messages.scanNumberInvalid,
    });
  });

  it('refuses a lookup while the link is down — manual entry is online-only (ADR-088)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      const { result } = mount({});
      await waitFor(() => expect(result.current.round).not.toBeNull());

      await act(async () => {
        await result.current.lookupNumber('0742');
      });

      expect(result.current.outcome).toEqual({
        kind: 'rejected',
        message: messages.manualEntryOffline,
      });
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });

  it('reports the offline message when the lookup itself dies mid-flight', async () => {
    // The link looked fine; the request found dead air. Same copy, no queueing (ADR-088).
    const { result } = mount({
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        offline: true,
      },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    let found: unknown = 'unset';
    await act(async () => {
      found = await result.current.lookupNumber(participantFixture.scanNumber);
    });

    expect(found).toBeNull();
    expect(result.current.outcome).toEqual({
      kind: 'rejected',
      message: messages.manualEntryOffline,
    });
    expect(readQueue()).toHaveLength(0);
  });

  it('hands back the participant on a clean lookup, leaving the outcome line alone', async () => {
    const { result } = mount({
      [`GET /api/staff/participants/by-number/${participantFixture.scanNumber}`]: {
        body: { participant: participantFixture },
      },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    let found: unknown = null;
    await act(async () => {
      found = await result.current.lookupNumber(participantFixture.scanNumber);
    });

    expect(found).toMatchObject({ nickname: participantFixture.nickname });
    expect(result.current.outcome).toBeNull();
  });

  it('advances to the next round through the API', async () => {
    const { result } = mount({
      'POST /api/fringe/rounds/round-1/advance': {
        status: 201,
        body: { round: { ...roundFixture, id: 'round-2', roundNumber: 2 } },
      },
    });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    await act(async () => result.current.advanceRoundNow());

    await waitFor(() =>
      expect(stub.callsTo('POST /api/fringe/rounds/round-1/advance')).toHaveLength(1),
    );
  });

  // ADR-092 — tier arming: sticky, server-priced, falls back to the first tier.
  const tieredActivity = {
    ...activityFixture,
    awardTiers: [
      { label: 'First place', points: 25 },
      { label: 'Second place', points: 10 },
    ],
  };

  it('posts the armed tier and names it in the confirmation', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': { body: { activity: tieredActivity } },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
      'POST /api/fringe/scans': {
        status: 201,
        body: {
          scan: { ...scanFixture, pointsAwardedSnapshot: 10, tierLabelSnapshot: 'Second place' },
          duplicate: false,
        },
      },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.round).not.toBeNull());
    expect(result.current.armedTier?.label).toBe('First place');

    act(() => result.current.armTier('Second place'));
    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    expect(stub.callsTo('POST /api/fringe/scans')[0]?.body).toMatchObject({
      tierLabel: 'Second place',
    });
    expect(result.current.outcome?.message).toBe('✓ BeachBoss +10 pts · Second place');
  });

  it('queues offline at the armed tier\'s price, labelled as such', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': { body: { activity: tieredActivity } },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
      'POST /api/fringe/scans': { offline: true },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    act(() => result.current.armTier('Second place'));
    await act(async () => {
      await result.current.submitScan('BeachBoss');
    });

    expect(result.current.outcome?.message).toBe('✓ BeachBoss +10 pts · Second place (queued)');
    expect(readQueue()[0]).toMatchObject({ tierLabel: 'Second place', pointValue: 10 });
  });

  it('falls back to the first tier when the armed label no longer exists', async () => {
    stub = installFetchStub({
    ...fringeStationRoutes(),
      'GET /api/fringe/activities/activity-1': { body: { activity: tieredActivity } },
      'GET /api/fringe/rounds/round-1/scans': { body: { items: [] } },
    });
    const { result } = renderHook(() => useFringeStation('activity-1'), { wrapper });
    await waitFor(() => expect(result.current.round).not.toBeNull());

    act(() => result.current.armTier('Ghost tier'));
    expect(result.current.armedTier?.label).toBe('First place');
  });
});
