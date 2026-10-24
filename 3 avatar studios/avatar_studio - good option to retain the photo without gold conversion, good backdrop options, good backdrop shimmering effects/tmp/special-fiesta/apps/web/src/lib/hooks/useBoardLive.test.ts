import type { LeaderboardView } from '@psd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { completedMatchFixture, matchFixture } from '../../test-utils/fixtures.js';
import { applyLiveLeaderboard, applyLiveMatch, resetLiveBoard } from '../live/boardLive.js';
import { useLeaderboard, useMatchFeed } from './useBoard.js';

/**
 * ADR-132 — the board surfaces take the socket's word for it.
 *
 * These are the browser half of B6's acceptance: the pushed frame must reach the rendered list
 * without a re-fetch, and — the half that is easy to forget — turning the stream off entirely
 * must leave the same surfaces correct, because the push is in addition to the polls and never
 * a substitute for them.
 */

let stub: FetchStub;
/*
 * Vitest unwinds `afterEach` in reverse registration order, so this runs BEFORE Testing
 * Library's auto-cleanup — the hooks are still mounted and subscribed. Resetting the store
 * notifies them, which is a React state update and must be inside `act` like any other.
 */
afterEach(() => {
  stub?.restore();
  act(() => resetLiveBoard());
});
beforeEach(() => {
  window.localStorage.clear();
  resetLiveBoard();
});

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

describe('ADR-132 — useMatchFeed takes pushed matches', () => {
  it('replaces a polled row with the pushed one', async () => {
    stub = installFetchStub({
      'GET /api/tournament/matches/feed': { body: { items: [matchFixture] } },
    });
    const { result } = renderHook(() => useMatchFeed());
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(result.current.matches[0]?.scoreA).toBe(matchFixture.scoreA);

    act(() => applyLiveMatch({ ...matchFixture, scoreA: matchFixture.scoreA + 4 }));

    expect(result.current.matches).toHaveLength(1);
    expect(result.current.matches[0]?.scoreA).toBe(matchFixture.scoreA + 4);
  });

  /** The case the plan called out: a court that started after this phone last polled. */
  it('inserts a match it has never seen rather than dropping it', async () => {
    stub = installFetchStub({
      'GET /api/tournament/matches/feed': { body: { items: [completedMatchFixture] } },
    });
    const { result } = renderHook(() => useMatchFeed());
    await waitFor(() => expect(result.current.matches).toHaveLength(1));

    act(() => applyLiveMatch({ ...matchFixture, id: 'brand-new', status: 'in_progress' }));

    expect(result.current.matches.map((item) => item.id)).toContain('brand-new');
    // And it leads the feed, because a live match outranks a completed one.
    expect(result.current.matches[0]?.id).toBe('brand-new');
  });

  it('removes a match that the frame says was cancelled', async () => {
    stub = installFetchStub({
      'GET /api/tournament/matches/feed': { body: { items: [matchFixture] } },
    });
    const { result } = renderHook(() => useMatchFeed());
    await waitFor(() => expect(result.current.matches).toHaveLength(1));

    act(() => applyLiveMatch({ ...matchFixture, status: 'cancelled' }));

    expect(result.current.matches).toEqual([]);
  });

  it('is exactly the polled feed when no frame ever arrives', async () => {
    stub = installFetchStub({
      'GET /api/tournament/matches/feed': { body: { items: [completedMatchFixture] } },
    });
    const { result } = renderHook(() => useMatchFeed());
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(result.current.matches[0]?.winnerTeamName).toBe('Sandstorm');
  });
});

describe('ADR-132 — useLeaderboard takes the pushed board', () => {
  it('renders the pushed board over the polled one', async () => {
    stub = installFetchStub({ 'GET /api/leaderboard': { body: leaderboard } });
    const { result } = renderHook(() => useLeaderboard('BP'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.totalPoints).toBe(10);

    act(() =>
      applyLiveLeaderboard({
        ...leaderboard,
        clusters: [{ ...leaderboard.clusters[0]!, totalPoints: 40 }],
        generatedAt: '2026-09-29T03:05:00.000Z',
      }),
    );

    expect(result.current.rows[0]?.totalPoints).toBe(40);
  });

  /**
   * A poll in flight when the push lands answers with the older truth. Taking whichever
   * arrived *last* would let the push make the board worse, so they are compared on
   * `generatedAt` instead.
   */
  it('ignores a pushed board older than the one already shown', async () => {
    stub = installFetchStub({ 'GET /api/leaderboard': { body: leaderboard } });
    const { result } = renderHook(() => useLeaderboard('BP'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    act(() =>
      applyLiveLeaderboard({
        ...leaderboard,
        clusters: [{ ...leaderboard.clusters[0]!, totalPoints: 999 }],
        generatedAt: '2026-09-29T02:00:00.000Z',
      }),
    );

    expect(result.current.rows[0]?.totalPoints).toBe(10);
  });

  /**
   * The push can beat the first poll — the store retains frames, so a surface mounting a
   * second late replays one immediately. With no polled board to compare against there is
   * nothing to prefer, and the pushed one must simply render.
   */
  it('renders a pushed board that arrived before the first poll answered', async () => {
    stub = installFetchStub({ 'GET /api/leaderboard': { body: leaderboard } });
    act(() =>
      applyLiveLeaderboard({
        ...leaderboard,
        clusters: [{ ...leaderboard.clusters[0]!, totalPoints: 77 }],
        generatedAt: '2026-09-29T03:20:00.000Z',
      }),
    );
    const { result } = renderHook(() => useLeaderboard('BP'));
    expect(result.current.rows[0]?.totalPoints).toBe(77);
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it('still renders the polled board when the stream never speaks', async () => {
    stub = installFetchStub({ 'GET /api/leaderboard': { body: leaderboard } });
    const { result } = renderHook(() => useLeaderboard('BP'));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.rows[0]?.sharePercent).toBe(100);
    expect(result.current.updatedAtLabel).not.toBe('');
  });
});
