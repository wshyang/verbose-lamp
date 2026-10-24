import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { STATUS_FEED_MATCH_EVENT, STATUS_LEADERBOARD_EVENT } from '@psd/contracts';
import type { AlertsView, LeaderboardView, MatchView } from '@psd/contracts';
import { installEventSourceStub } from '../../test-utils/eventSourceStub.js';
import type { EventSourceStub } from '../../test-utils/eventSourceStub.js';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { matchFixture, participantSession } from '../../test-utils/fixtures.js';
import { resetLiveBoard } from '../live/boardLive.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { useAlertsStore } from './useAlertsStore.js';
import { useLeaderboard, useMatchFeed } from './useBoard.js';

/**
 * ADR-131/132 — the whole path, from an SSE frame on the wire to the rendered list.
 *
 * The hook tests next door drive the store directly, which proves the merge but assumes the
 * frame ever arrives. This drives the real `EventSource` client with a stubbed socket, so the
 * event *names* in `@psd/contracts`, the listeners in `statusStream.ts`, the forwarding in
 * `useAlertsStore` and the merge in `useBoard` are all on the hook — a typo in any one of them
 * fails here and nowhere else.
 *
 * It is also B6's acceptance test in the browser, in the form this workspace can actually run:
 * the Playwright CDN is unreachable from the sandbox, and `npm run verify` does not run e2e in
 * any case, so a spec written here would never have been executed. A stubbed `EventSource` is
 * the same instrument the plan asked for, one layer down.
 */

const QUIET: AlertsView = {
  teamUpSoon: { upSoon: false, gamesAway: null, fixtureId: null },
  feeds: { chat: null, teamChat: null, gallery: null },
  announcements: [],
};

const leaderboard: LeaderboardView = {
  clusters: [
    {
      clusterCode: 'BP',
      displayName: 'BP',
      fringePoints: 10,
      tournamentPoints: 0,
      totalPoints: 10,
      participantCount: 2,
      rank: 1,
      reachedAt: '2026-09-29T02:00:00.000Z',
    },
  ],
  topIndividuals: [],
  generatedAt: '2026-09-29T03:00:00.000Z',
};

let stub: FetchStub;
let stream: EventSourceStub;

function participantWrapper({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

/** The shell's socket and a board surface, mounted together as the real app mounts them. */
function renderShellWithBoard() {
  stub = installFetchStub({
    'GET /api/me/alerts': { body: QUIET },
    'GET /api/leaderboard': { body: leaderboard },
    'GET /api/tournament/matches/feed': { body: { items: [matchFixture] } },
  });
  return renderHook(
    () => {
      useAlertsStore();
      return { feed: useMatchFeed(), board: useLeaderboard('BP') };
    },
    { wrapper: participantWrapper },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetLiveBoard();
  stream = installEventSourceStub();
});
afterEach(() => {
  stream.restore();
  stub?.restore();
  act(() => resetLiveBoard());
});

describe('ADR-132 — a frame on the socket reaches the rendered board', () => {
  it('moves a scoreline without a re-fetch', async () => {
    const { result } = renderShellWithBoard();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    await waitFor(() => expect(result.current.feed.matches).toHaveLength(1));

    const pushed: MatchView = { ...matchFixture, scoreA: matchFixture.scoreA + 3 };
    act(() => stream.emitRaw(STATUS_FEED_MATCH_EVENT, JSON.stringify(pushed)));

    await waitFor(() => expect(result.current.feed.matches[0]?.scoreA).toBe(pushed.scoreA));
    // No second request: the frame carried the row, which is the whole point of B6.
    expect(stub.callsTo('GET /api/tournament/matches/feed')).toHaveLength(1);
  });

  it('moves the board on a completion', async () => {
    const { result } = renderShellWithBoard();
    await waitFor(() => expect(stream.openCount()).toBe(1));
    await waitFor(() => expect(result.current.board.rows).toHaveLength(1));
    expect(result.current.board.rows[0]?.totalPoints).toBe(10);

    act(() =>
      stream.emitRaw(
        STATUS_LEADERBOARD_EVENT,
        JSON.stringify({
          ...leaderboard,
          clusters: [{ ...leaderboard.clusters[0]!, totalPoints: 33 }],
          generatedAt: '2026-09-29T03:10:00.000Z',
        }),
      ),
    );

    await waitFor(() => expect(result.current.board.rows[0]?.totalPoints).toBe(33));
  });

  /** A malformed frame must not take the shell down; the fallback poll carries on. */
  it('survives a frame that is not the JSON it expects', async () => {
    const { result } = renderShellWithBoard();
    await waitFor(() => expect(result.current.feed.matches).toHaveLength(1));

    act(() => stream.emitRaw(STATUS_FEED_MATCH_EVENT, 'not json'));

    expect(result.current.feed.matches).toHaveLength(1);
    expect(result.current.board.rows).toHaveLength(1);
  });

  /**
   * B6's ruling: the push is in addition to the cache discipline, never a substitute. With the
   * socket silent for the whole lifetime of the surfaces, both must still be right.
   */
  it('is correct with the stream switched off, only chattier', async () => {
    const { result } = renderShellWithBoard();
    await waitFor(() => expect(result.current.feed.matches).toHaveLength(1));
    await waitFor(() => expect(result.current.board.rows).toHaveLength(1));

    expect(result.current.feed.matches[0]?.id).toBe(matchFixture.id);
    expect(result.current.board.rows[0]?.totalPoints).toBe(10);
    expect(result.current.board.updatedAtLabel).not.toBe('');
  });
});
