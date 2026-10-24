import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { participantFixture, participantSession, scanFixture } from '../../test-utils/fixtures.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { useMyScans, useProfile } from './useParticipantHome.js';

/**
 * fds.md F20 §642 — "participant total and cluster leaderboard updated", immediately.
 *
 * This is the one freshness rule the device cache may not bend, and it is worth its own
 * file because it is a PRODUCT invariant rather than a cache behaviour: a facilitator
 * scans somebody at the volleyball net, that person opens their phone a few seconds
 * later, and the number they came to look at must be the new one.
 *
 * `/api/me` and `/api/me/scans` both carry that number. They look like identity reads —
 * the participant, their nickname, their cluster — which is exactly the trap: the payload
 * is identity PLUS a live counter, and a TTL that is right for the first half silently
 * freezes the second. There is no client-side signal to invalidate on either, because the
 * scan happens on somebody else's device and `/api/me/alerts` carries no total, so the
 * only honest policy is warm-start: paint the known card at once, always ask again.
 *
 * The cost is that these two reads save no requests. That is the correct trade and it is
 * recorded in ADR-112/ADR-113 rather than quietly counted as a win.
 */

let stub: FetchStub;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  stub?.restore();
  window.localStorage.clear();
});

function signedIn({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

function totalsOf(totalPoints: number, scanCount: number) {
  return { totalPoints, fringePoints: totalPoints, tournamentPoints: 0, scanCount };
}

describe('a participant who has just been scanned (fds.md §642)', () => {
  it('sees the new total on their card, not the one from before the scan', async () => {
    stub = installFetchStub({
      'GET /api/me': { body: { participant: participantFixture, totals: totalsOf(40, 2) } },
    });

    const before = renderHook(() => useProfile(), { wrapper: signedIn });
    await waitFor(() => expect(before.result.current.totals?.totalPoints).toBe(40));
    before.unmount();

    // A facilitator awards 15 points at the net. Nothing on this phone knows that happened.
    stub.routes['GET /api/me'] = {
      body: { participant: participantFixture, totals: totalsOf(55, 3) },
    };

    // They open their card seconds later — well inside any sixty-second identity window.
    const after = renderHook(() => useProfile(), { wrapper: signedIn });

    // The known card still paints instantly: no spinner on the page they open all day.
    expect(after.result.current.totals?.totalPoints).toBe(40);
    expect(after.result.current.isLoading).toBe(false);
    // …and the number they came to see is correct a moment later.
    await waitFor(() => expect(after.result.current.totals?.totalPoints).toBe(55));
    after.unmount();
  });

  it('finds the scan itself in their history rather than a minute-old list', async () => {
    stub = installFetchStub({
      'GET /api/me/scans': { body: { items: [], totals: totalsOf(40, 2) } },
    });

    const before = renderHook(() => useMyScans(), { wrapper: signedIn });
    await waitFor(() => expect(before.result.current.totalPoints).toBe(40));
    expect(before.result.current.scans).toHaveLength(0);
    before.unmount();

    stub.routes['GET /api/me/scans'] = {
      body: { items: [scanFixture], totals: totalsOf(55, 3) },
    };

    const after = renderHook(() => useMyScans(), { wrapper: signedIn });

    // Scan history is the page a participant opens to check a scan LANDED. Serving a
    // remembered list that cannot contain it answers the opposite of the question asked.
    await waitFor(() => expect(after.result.current.scans).toHaveLength(1));
    expect(after.result.current.totalPoints).toBe(55);
    await act(() => Promise.resolve());
    after.unmount();
  });
});
