import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub, RouteTable } from '../../test-utils/fetchStub.js';
import { completedMatchFixture, courtFixture, matchFixture } from '../../test-utils/fixtures.js';
import { useCourtConsole, useCourtList } from './useCourtConsole.js';
import { courtConsoleRoutes } from '../../test-utils/ambientRoutes.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const teams = [
  { id: 'team-a', teamName: 'Sandstorm', captainNickname: 'BeachBoss', memberCount: 6, isLocked: false, createdAt: '2026-09-29T01:45:00.000Z' },
  { id: 'team-b', teamName: 'Wave Riders', captainNickname: 'Bryan', memberCount: 5, isLocked: false, createdAt: '2026-09-29T01:46:00.000Z' },
];

function mount(routes: RouteTable) {
  stub = installFetchStub({
    ...courtConsoleRoutes(),
    'GET /api/tournament/courts': { body: { items: [courtFixture] } },
    'GET /api/teams': { body: { items: teams } },
    ...routes,
  });
  return renderHook(() => useCourtConsole('court-1'));
}

describe('useCourtList', () => {
  it('separates enabled courts from disabled ones', async () => {
    stub = installFetchStub({
    ...courtConsoleRoutes(),
      'GET /api/tournament/courts': {
        body: { items: [courtFixture, { ...courtFixture, id: 'court-2', isEnabled: false }] },
      },
    });
    const { result } = renderHook(() => useCourtList());

    await waitFor(() => expect(result.current.courts).toHaveLength(2));
    expect(result.current.enabledCourts).toHaveLength(1);
  });
});

describe('useCourtConsole', () => {
  it('only allows a start once two different teams are chosen', async () => {
    const { result } = mount({
      'GET /api/tournament/courts/court-1/current-match': { body: { match: null } },
      'POST /api/tournament/matches': { status: 201, body: { match: matchFixture } },
    });
    await waitFor(() => expect(result.current.hasEnoughTeams).toBe(true));

    act(() => result.current.setTeamAId('team-a'));
    act(() => result.current.setTeamBId('team-a'));
    expect(result.current.canStart).toBe(false);

    act(() => result.current.setTeamBId('team-b'));
    await waitFor(() => expect(result.current.canStart).toBe(true));

    await act(async () => result.current.startMatchNow());
    expect(stub.callsTo('POST /api/tournament/matches')[0]?.body).toEqual({
      courtId: 'court-1',
      teamAId: 'team-a',
      teamBId: 'team-b',
    });
  });

  it('completes the live match with the chosen winner', async () => {
    const { result } = mount({
      'GET /api/tournament/courts/court-1/current-match': { body: { match: matchFixture } },
      'POST /api/tournament/matches/match-1/complete': { body: { match: completedMatchFixture } },
    });
    await waitFor(() => expect(result.current.match?.id).toBe('match-1'));

    await act(async () => result.current.declareWinner('team-b'));

    expect(stub.callsTo('POST /api/tournament/matches/match-1/complete')[0]?.body).toEqual({
      winnerTeamId: 'team-b',
      // ADR-329 F5 — the tiebreak travels on every completion; a plain declare is not one.
      tiebreakMethod: null,
    });
  });
});
