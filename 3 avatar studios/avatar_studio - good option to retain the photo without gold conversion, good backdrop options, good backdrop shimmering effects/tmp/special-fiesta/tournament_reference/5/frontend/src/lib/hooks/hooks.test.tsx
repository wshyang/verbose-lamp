// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimulation } from './useSimulation.js';
import { useDesk } from './useDesk.js';
import { api } from '../api.js';
import type { TournamentGraph } from '../../../../shared/types.js';

vi.mock('../api.js', () => ({
  api: {
    listTournaments: vi.fn(),
    getTournament: vi.fn(),
    createTournament: vi.fn(),
    stageManualMatch: vi.fn(),
    startMatch: vi.fn(),
    scoreMatch: vi.fn(),
    finaliseMatch: vi.fn(),
    cancelMatch: vi.fn(),
    assignPoints: vi.fn(),
    voidPoints: vi.fn(),
    applyContingency: vi.fn(),
    closeTournament: vi.fn(),
  },
}));

const mocked = vi.mocked(api);

const graph = {
  tournament: {
    id: 't1', name: 'Cup', mode: 'round-robin', status: 'live',
    config: {
      courts: 2, matchLengthMinutes: 20, tournamentLengthMinutes: 480,
      startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
    },
  },
  teams: [], courts: [], matches: [], pointsEntries: [], standings: [],
} as unknown as TournamentGraph;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listTournaments.mockResolvedValue([]);
});

describe('useSimulation', () => {
  it('simulates the default round robin', () => {
    const { result } = renderHook(() => useSimulation());
    expect(result.current.result?.playableMatches).toBe(28);
    expect(result.current.validationError).toBeNull();
  });

  it('surfaces validation errors and enforces ironman rest', () => {
    const { result } = renderHook(() => useSimulation());
    act(() => result.current.setMode('consolation'));
    expect(result.current.result).not.toBeNull();
    act(() => result.current.setTeamCount(6));
    expect(result.current.result).toBeNull();
    expect(result.current.validationError).toContain('exactly 8');
    act(() => result.current.setMode('ironman'));
    act(() => result.current.setRestMinutes(30));
    expect(result.current.effectiveRestMinutes).toBe(0);
    act(() => result.current.setCourts(3));
    act(() => result.current.setMatchLengthMinutes(15));
    act(() => result.current.setTournamentLengthMinutes(300));
    act(() => result.current.setStartTime('10:30'));
    expect(result.current.config.startMinutes).toBe(630);
  });
});

describe('useDesk', () => {
  it('loads the tournament list on mount', async () => {
    mocked.listTournaments.mockResolvedValue([graph.tournament]);
    const { result } = renderHook(() => useDesk());
    await waitFor(() => expect(result.current.tournaments).toHaveLength(1));
    expect(result.current.graph).toBeNull();
  });

  it('creates, selects and runs every desk action', async () => {
    mocked.createTournament.mockResolvedValue(graph);
    mocked.getTournament.mockResolvedValue(graph);
    mocked.stageManualMatch.mockResolvedValue(graph);
    mocked.startMatch.mockResolvedValue(graph);
    mocked.scoreMatch.mockResolvedValue(graph);
    mocked.finaliseMatch.mockResolvedValue(graph);
    mocked.cancelMatch.mockResolvedValue(graph);
    mocked.assignPoints.mockResolvedValue(graph);
    mocked.voidPoints.mockResolvedValue(graph);
    mocked.applyContingency.mockResolvedValue(graph);
    mocked.closeTournament.mockResolvedValue(graph);
    const { result } = renderHook(() => useDesk());
    await act(async () => {
      await result.current.createTournament({
        name: 'Cup', mode: 'round-robin', teamNames: ['A', 'B'],
        config: graph.tournament.config,
      });
    });
    expect(result.current.graph?.tournament.id).toBe('t1');
    await act(async () => { await result.current.selectTournament('t1'); });
    await act(async () => { await result.current.stageManualMatch({ teamAId: 'a', teamBId: 'b' }); });
    await act(async () => { await result.current.startMatch('m1'); });
    await act(async () => { await result.current.scoreMatch('m1', 5, 2); });
    await act(async () => { await result.current.finaliseMatch('m1'); });
    await act(async () => { await result.current.cancelMatch('m2'); });
    await act(async () => { await result.current.assignPoints('a', 3, 'Bonus'); });
    await act(async () => { await result.current.voidPoints('p1', 'Mistake'); });
    await act(async () => { await result.current.applyContingency(1, 10); });
    await act(async () => { await result.current.closeTournament(); });
    await act(async () => { await result.current.refreshTournaments(); });
    expect(mocked.closeTournament).toHaveBeenCalledWith('t1');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('records errors from the API and from actions without a tournament', async () => {
    mocked.listTournaments.mockRejectedValue(new Error('desk offline'));
    const { result } = renderHook(() => useDesk());
    await waitFor(() => expect(result.current.error).toBe('desk offline'));
    await act(async () => { await result.current.stageManualMatch({ teamAId: 'a', teamBId: 'b' }); });
    expect(result.current.error).toBe('Open a tournament first');
    await act(async () => { await result.current.assignPoints('a', 1, 'x'); });
    await act(async () => { await result.current.applyContingency(1, 10); });
    await act(async () => { await result.current.closeTournament(); });
    mocked.startMatch.mockRejectedValue('plain string failure');
    await act(async () => { await result.current.startMatch('m1'); });
    expect(result.current.error).toBe('Something went wrong');
  });
});
