import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { completedMatchFixture, participantSession } from '../../test-utils/fixtures.js';
import { writeCached } from '../storage/cacheStore.js';
import { SessionContext } from '../session/context.js';
import type { SessionState } from '../session/context.js';
import { useLeaderboard, useMatchFeed } from './useBoard.js';

let stub: FetchStub;
afterEach(() => stub?.restore());
beforeEach(() => window.localStorage.clear());

const ACTOR = participantSession.participant?.id as string;
const leaderboard = {
  clusters: [
    { clusterCode: 'BP', displayName: 'BP', fringePoints: 70, tournamentPoints: 30, totalPoints: 100, participantCount: 6, rank: 1 },
    { clusterCode: 'CS', displayName: 'CS', fringePoints: 20, tournamentPoints: 5, totalPoints: 25, participantCount: 4, rank: 2 },
    { clusterCode: 'WD', displayName: 'WD', fringePoints: 0, tournamentPoints: 0, totalPoints: 0, participantCount: 0, rank: 3 },
  ],
  topIndividuals: [],
  generatedAt: '2026-09-29T03:00:00.000Z',
};

function participantWrapper({ children }: { children: ReactNode }) {
  const state: SessionState = {
    session: participantSession,
    isLoading: false,
    refresh: () => Promise.resolve(participantSession),
    endSession: () => Promise.resolve(true),
  };
  return createElement(SessionContext.Provider, { value: state }, children);
}

describe('useLeaderboard', () => {
  it('scales each cluster bar against the leader', async () => {
    stub = installFetchStub({ 'GET /api/leaderboard': { body: leaderboard } });
    const { result } = renderHook(() => useLeaderboard('CS'));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.rows.map((row) => row.sharePercent)).toEqual([100, 25, 0]);
    expect(result.current.rows[1]?.isViewerCluster).toBe(true);
    expect(result.current.hasAnyPoints).toBe(true);
  });

  it('reopens the board from a recent poll without a duplicate mount request', () => {
    writeCached('leaderboard', ACTOR, leaderboard);
    stub = installFetchStub({});

    const { result } = renderHook(() => useLeaderboard('CS'), { wrapper: participantWrapper });

    expect(result.current.rows).toHaveLength(3);
    expect(stub.callsTo('GET /api/leaderboard')).toHaveLength(0);
  });

  it('reports the empty board before anyone scores', async () => {
    stub = installFetchStub({
      'GET /api/leaderboard': {
        body: {
          ...leaderboard,
          clusters: leaderboard.clusters.map((row) => ({
            ...row,
            fringePoints: 0,
            tournamentPoints: 0,
            totalPoints: 0,
          })),
        },
      },
    });
    const { result } = renderHook(() => useLeaderboard(null));

    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.hasAnyPoints).toBe(false);
    expect(result.current.rows.every((row) => row.sharePercent === 0)).toBe(true);
  });
});

describe('useMatchFeed', () => {
  it('returns completed matches for the shared feed (S60)', async () => {
    stub = installFetchStub({
      'GET /api/tournament/matches/feed': { body: { items: [completedMatchFixture] } },
    });
    const { result } = renderHook(() => useMatchFeed());

    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(result.current.matches[0]?.winnerTeamName).toBe('Sandstorm');
  });
});
