import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub } from '../../test-utils/fetchStub.js';
import type { FetchStub } from '../../test-utils/fetchStub.js';
import { completedMatchFixture, teamFixture } from '../../test-utils/fixtures.js';
import { useCreateTeam, useJoinByCode, useMyTeam, useTeamBrowser, useTeamDetail } from './useTeams.js';

let stub: FetchStub;
afterEach(() => stub?.restore());

const summaries = [
  { id: 'team-a', teamName: 'Sandstorm', captainNickname: 'BeachBoss', memberCount: 6, isLocked: false, createdAt: '2026-09-29T01:45:00.000Z' },
  { id: 'team-b', teamName: 'Wave Riders', captainNickname: 'Bryan', memberCount: 5, isLocked: true, createdAt: '2026-09-29T01:46:00.000Z' },
];

describe('useTeamBrowser', () => {
  it('filters the list client-side and joins by id', async () => {
    stub = installFetchStub({
      'GET /api/teams': { body: { items: summaries } },
      'POST /api/teams/team-b/join': { status: 201, body: { team: teamFixture } },
    });
    const onJoined = vi.fn();
    const { result } = renderHook(() => useTeamBrowser(onJoined));

    await waitFor(() => expect(result.current.teams).toHaveLength(2));
    act(() => result.current.setSearch('wave'));
    await waitFor(() => expect(result.current.teams).toHaveLength(1));

    await act(async () => result.current.joinTeam('team-b'));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
  });
});

describe('useCreateTeam and useJoinByCode', () => {
  it('requires a 3-character name and a 6-character code', async () => {
    stub = installFetchStub({
      'POST /api/teams': { status: 201, body: { team: teamFixture } },
      'POST /api/teams/join': { status: 201, body: { team: teamFixture } },
    });
    const create = renderHook(() => useCreateTeam(vi.fn()));
    act(() => create.result.current.setTeamName('ab'));
    expect(create.result.current.canSubmit).toBe(false);
    act(() => create.result.current.setTeamName('Sandstorm'));
    await waitFor(() => expect(create.result.current.canSubmit).toBe(true));

    const join = renderHook(() => useJoinByCode(vi.fn()));
    act(() => join.result.current.setJoinCode('abc23'));
    expect(join.result.current.canSubmit).toBe(false);
    act(() => join.result.current.setJoinCode('abc234'));
    await waitFor(() => expect(join.result.current.joinCode).toBe('ABC234'));
    expect(join.result.current.canSubmit).toBe(true);
  });
});

describe('useMyTeam', () => {
  it('separates the captain from the other members and adds by nickname', async () => {
    stub = installFetchStub({
      'GET /api/teams/mine': { body: { team: teamFixture } },
      'POST /api/teams/team-a/members': { status: 201, body: { team: teamFixture } },
    });
    const { result } = renderHook(() => useMyTeam());

    await waitFor(() => expect(result.current.team?.teamName).toBe('Sandstorm'));
    expect(result.current.others.map((member) => member.nickname)).toEqual(['SandSprinter']);

    act(() => result.current.setNicknameToAdd('NewPlayer'));
    await act(async () => {
      await result.current.submitAddMember();
    });
    expect(stub.callsTo('POST /api/teams/team-a/members')[0]?.body).toEqual({
      nickname: 'NewPlayer',
    });
  });

  it('does nothing at all for a player who has no team yet', async () => {
    stub = installFetchStub({ 'GET /api/teams/mine': { body: { team: null } } });
    const { result } = renderHook(() => useMyTeam());

    await waitFor(() => expect(result.current.team).toBeNull());
    act(() => result.current.setNicknameToAdd('NewPlayer'));
    await act(async () => {
      await result.current.submitAddMember();
      result.current.lockTeam();
      result.current.unlockTeam();
      result.current.leaveTeamNow();
      result.current.kick('participant-2');
      result.current.makeCaptain('participant-2');
    });
    expect(stub.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
  });

  it('unlocks a locked roster again (F14)', async () => {
    stub = installFetchStub({
      'GET /api/teams/mine': { body: { team: { ...teamFixture, isLocked: true } } },
      'PATCH /api/teams/team-a/lock': { body: { team: teamFixture } },
    });
    const { result } = renderHook(() => useMyTeam());

    await waitFor(() => expect(result.current.team?.isLocked).toBe(true));
    await act(async () => {
      result.current.unlockTeam();
    });
    await waitFor(() => expect(stub.callsTo('PATCH /api/teams/team-a/lock')).toHaveLength(1));
    expect(stub.callsTo('PATCH /api/teams/team-a/lock')[0]?.body).toEqual({ isLocked: false });
  });
});

describe('useTeamDetail', () => {
  it('computes the win/loss record from completed matches only', async () => {
    stub = installFetchStub({
      'GET /api/teams/team-a': { body: { team: teamFixture } },
      'GET /api/teams/team-a/matches': {
        body: {
          items: [
            completedMatchFixture,
            { ...completedMatchFixture, id: 'match-2', winnerTeamId: 'team-b', winnerTeamName: 'Wave Riders' },
            { ...completedMatchFixture, id: 'match-3', status: 'in_progress', winnerTeamId: null },
          ],
        },
      },
    });
    const { result } = renderHook(() => useTeamDetail('team-a'));

    await waitFor(() => expect(result.current.matches).toHaveLength(3));
    expect(result.current.record).toEqual({ wins: 1, draws: 0, losses: 1, played: 2 });
  });

  /*
   * ADR-156 — the regression the subtraction hid: before draws were counted directly, the
   * drawn match below landed in `losses`, and a team that had never been beaten was shown a
   * defeat. The live match is still outside the record entirely.
   */
  it('counts a drawn match as a draw rather than as a loss', async () => {
    stub = installFetchStub({
      'GET /api/teams/team-a': { body: { team: teamFixture } },
      'GET /api/teams/team-a/matches': {
        body: {
          items: [
            completedMatchFixture,
            { ...completedMatchFixture, id: 'match-2', winnerTeamId: null, winnerTeamName: null },
            { ...completedMatchFixture, id: 'match-3', status: 'in_progress', winnerTeamId: null },
          ],
        },
      },
    });
    const { result } = renderHook(() => useTeamDetail('team-a'));

    await waitFor(() => expect(result.current.matches).toHaveLength(3));
    expect(result.current.record).toEqual({ wins: 1, draws: 1, losses: 0, played: 2 });
  });

  it('reports the match-history failure of an otherwise healthy team', async () => {
    stub = installFetchStub({
      'GET /api/teams/team-a': { body: { team: teamFixture } },
      'GET /api/teams/team-a/matches': {
        status: 500,
        body: { error: { message: 'Something went wrong on our side.' } },
      },
    });
    const { result } = renderHook(() => useTeamDetail('team-a'));

    await waitFor(() => expect(result.current.error).toBe('Something went wrong on our side.'));
    expect(result.current.record).toEqual({ wins: 0, draws: 0, losses: 0, played: 0 });
  });
});
