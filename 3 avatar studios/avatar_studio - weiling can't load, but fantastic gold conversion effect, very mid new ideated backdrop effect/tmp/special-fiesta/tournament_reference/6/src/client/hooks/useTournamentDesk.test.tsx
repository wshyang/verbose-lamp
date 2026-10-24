// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SimulationResult, TournamentRecord, TournamentSnapshot } from '../../shared/contracts.js';
import { ApiError, api } from '../api.js';
import { useTournamentDesk } from './useTournamentDesk.js';
import { formats, matchView, snapshot, tournamentRecord } from '../../test/fixtures.js';

const original = snapshot();
const alternate = snapshot({ tournament: tournamentRecord({ id: 'event-2', name: 'Sunday Cup', courtCount: 5, matchDurationMinutes: 30, startTimeMinutes: 600 }) });
const recent = [original.tournament];
const simulation: SimulationResult = {
  mode: 'single-elimination',
  teams: original.teams,
  matches: [matchView()],
  scheduleSummary: original.scheduleSummary,
  groupKeys: [],
};

afterEach(() => vi.restoreAllMocks());

describe('useTournamentDesk state and actions', () => {
  it('loads an empty dashboard with deterministic defaults', async () => {
    mockDashboard([]);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.activeView).toBe('simulator');
    expect(result.current.formats).toEqual(formats);
    expect(result.current.recentTournaments).toEqual([]);
    expect(result.current.tournament).toBeNull();
    expect(result.current.settings).toMatchObject({ teamCount: 8, courtCount: 3, matchDurationMinutes: 20 });
    expect(result.current.teamNames).toHaveLength(8);
    expect(result.current.teamNames[0]).toBe('Team 1');
    expect(result.current.matchSections).toEqual([]);
    expect(result.current.timeline).toEqual([]);
    expect(result.current.error).toBe('');
  });

  it('opens the most recent event, then opens another event on request', async () => {
    mockDashboard(recent, original);
    const getTournament = vi.spyOn(api, 'getTournament').mockResolvedValueOnce(original).mockResolvedValueOnce(alternate);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tournament?.tournament.id).toBe('event-1');
    expect(result.current.weather).toEqual({ courtCount: 2, matchDurationMinutes: 20, effectiveAtMinutes: 540 });
    await act(async () => result.current.openTournament('event-2'));
    expect(getTournament).toHaveBeenLastCalledWith('event-2');
    expect(result.current.activeView).toBe('tournament');
    expect(result.current.tournament?.tournament.name).toBe('Sunday Cup');
    expect(result.current.weather).toEqual({ courtCount: 5, matchDurationMinutes: 30, effectiveAtMinutes: 600 });
  });

  it('shows an initial loading failure and always ends the loading state', async () => {
    vi.spyOn(api, 'getFormats').mockRejectedValue(new ApiError(503, 'OFFLINE', 'Server is offline.'));
    vi.spyOn(api, 'getTournaments').mockResolvedValue([]);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Server is offline.');
  });

  it('does not update state after unmount while the dashboard request is pending', async () => {
    const formatRequest = deferred<typeof formats>();
    const eventRequest = deferred<TournamentRecord[]>();
    vi.spyOn(api, 'getFormats').mockReturnValue(formatRequest.promise);
    vi.spyOn(api, 'getTournaments').mockReturnValue(eventRequest.promise);
    const { unmount } = renderHook(() => useTournamentDesk());
    unmount();
    await act(async () => {
      formatRequest.resolve(formats);
      eventRequest.resolve([]);
      await Promise.resolve();
    });
  });

  it('does not open a recent event after unmount while its snapshot is loading', async () => {
    const eventRequest = deferred<TournamentSnapshot>();
    mockDashboard(recent);
    vi.spyOn(api, 'getTournament').mockReturnValue(eventRequest.promise);
    const { unmount } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(api.getTournament).toHaveBeenCalledWith('event-1'));
    unmount();
    await act(async () => {
      eventRequest.resolve(original);
      await Promise.resolve();
    });
  });

  it('updates configuration, preserves names, and applies a fixed-count format', async () => {
    mockDashboard([]);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setTeamNames(['North', 'South']));
    act(() => result.current.updateTeamCount(3));
    expect(result.current.teamNames).toEqual(['North', 'South', 'Team 3']);
    act(() => result.current.updateSetting('courtCount', 4));
    expect(result.current.settings.courtCount).toBe(4);
    act(() => result.current.changeMode('points-rush'));
    expect(result.current.selectedMode).toBe('points-rush');
    expect(result.current.settings.teamCount).toBe(12);
    expect(result.current.teamNames).toHaveLength(12);
    expect(result.current.teamNames.slice(0, 3)).toEqual(['North', 'South', 'Team 3']);
    act(() => result.current.changeMode('manual'));
    expect(result.current.selectedMode).toBe('manual');
    expect(result.current.settings.teamCount).toBe(12);
  });

  it('previews the selected mode and creates a tournament with refreshed recent events', async () => {
    vi.spyOn(api, 'getFormats').mockResolvedValue(formats);
    vi.spyOn(api, 'getTournaments').mockResolvedValueOnce([]).mockResolvedValueOnce([original.tournament]);
    const preview = vi.spyOn(api, 'preview').mockResolvedValue(simulation);
    vi.spyOn(api, 'createTournament').mockResolvedValue(original);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.previewFormat());
    expect(preview).toHaveBeenCalledWith({
      mode: 'single-elimination',
      settings: result.current.settings,
      teamNames: result.current.teamNames,
    });
    expect(result.current.preview).toEqual(simulation);
    expect(result.current.matchSections[0]?.title).toBe('Round 1');
    expect(result.current.timeline).toEqual(simulation.matches);
    await act(async () => result.current.createTournament());
    expect(result.current.tournament?.tournament.id).toBe('event-1');
    expect(result.current.preview).toBeNull();
    expect(result.current.activeView).toBe('tournament');
    expect(result.current.recentTournaments).toEqual([original.tournament]);
    expect(result.current.weather.effectiveAtMinutes).toBe(540);
    expect(result.current.busy).toBe(false);
  });

  it('runs weather, staging, scoring, awards, reversals, and close actions against the open event', async () => {
    mockDashboard(recent, original);
    const updated = snapshot({ tournament: tournamentRecord({ id: 'event-1', status: 'running' }) });
    const spies = {
      changeResources: vi.spyOn(api, 'changeResources').mockResolvedValue(updated),
      stageMatch: vi.spyOn(api, 'stageMatch').mockResolvedValue(updated),
      updateLiveScore: vi.spyOn(api, 'updateLiveScore').mockResolvedValue(updated),
      finalizeMatch: vi.spyOn(api, 'finalizeMatch').mockResolvedValue(updated),
      awardPoints: vi.spyOn(api, 'awardPoints').mockResolvedValue(updated),
      voidPointAward: vi.spyOn(api, 'voidPointAward').mockResolvedValue(updated),
      closeTournament: vi.spyOn(api, 'closeTournament').mockResolvedValue(updated),
    };
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateWeather('courtCount', 1));
    await act(async () => result.current.applyWeatherChange());
    await act(async () => result.current.stageMatch({ homeTeamId: 'team-1', awayTeamId: 'team-2' }));
    await act(async () => result.current.saveLiveScore('match-1', { home: 1, away: 0 }));
    await act(async () => result.current.finalizeMatch('match-1', { home: 1, away: 0 }));
    await act(async () => result.current.awardPoints({ teamId: 'team-1', points: 2, reason: 'Desk' }));
    await act(async () => result.current.voidPointAward('point-1', 'Mistake'));
    await act(async () => result.current.closeTournament('Done'));
    expect(spies.changeResources).toHaveBeenCalledWith('event-1', expect.objectContaining({ courtCount: 1 }));
    expect(spies.stageMatch).toHaveBeenCalledWith('event-1', { homeTeamId: 'team-1', awayTeamId: 'team-2' });
    expect(spies.updateLiveScore).toHaveBeenCalledWith('event-1', 'match-1', { home: 1, away: 0 });
    expect(spies.finalizeMatch).toHaveBeenCalledWith('event-1', 'match-1', { home: 1, away: 0 });
    expect(spies.awardPoints).toHaveBeenCalledWith('event-1', { teamId: 'team-1', points: 2, reason: 'Desk' });
    expect(spies.voidPointAward).toHaveBeenCalledWith('event-1', 'point-1', 'Mistake');
    expect(spies.closeTournament).toHaveBeenCalledWith('event-1', 'Done');
    expect(result.current.tournament).toEqual(updated);
  });

  it('does nothing for event-specific actions until an event is open', async () => {
    mockDashboard([]);
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.applyWeatherChange());
    await act(async () => result.current.stageMatch({ homeTeamId: 'a', awayTeamId: 'b' }));
    await act(async () => result.current.saveLiveScore('m', { home: 1, away: 0 }));
    await act(async () => result.current.finalizeMatch('m', { home: 1, away: 0 }));
    await act(async () => result.current.awardPoints({ teamId: 'a', points: 1, reason: 'X' }));
    await act(async () => result.current.voidPointAward('p', 'X'));
    await act(async () => result.current.closeTournament('X'));
    expect(result.current.tournament).toBeNull();
    expect(result.current.error).toBe('');
  });

  it('reports API, ordinary, empty, and non-Error failures and clears prior errors on retry', async () => {
    mockDashboard([]);
    const preview = vi.spyOn(api, 'preview');
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    preview.mockRejectedValueOnce(new ApiError(422, 'INVALID_INPUT', 'Bad setup.'));
    await act(async () => result.current.previewFormat());
    expect(result.current.error).toBe('Bad setup.');
    preview.mockRejectedValueOnce(new Error('Network failure'));
    await act(async () => result.current.previewFormat());
    expect(result.current.error).toBe('Network failure');
    preview.mockRejectedValueOnce(new Error(''));
    await act(async () => result.current.previewFormat());
    expect(result.current.error).toBe('The request could not be completed.');
    preview.mockRejectedValueOnce('failure');
    await act(async () => result.current.previewFormat());
    expect(result.current.error).toBe('The request could not be completed.');
    preview.mockResolvedValueOnce(simulation);
    await act(async () => result.current.previewFormat());
    expect(result.current.error).toBe('');
  });

  it('keeps the current page and reports an event-open failure', async () => {
    mockDashboard([]);
    const getTournament = vi.spyOn(api, 'getTournament').mockRejectedValue(new Error('Not available'));
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.openTournament('missing'));
    expect(getTournament).toHaveBeenCalledWith('missing');
    expect(result.current.tournament).toBeNull();
    expect(result.current.error).toBe('Not available');
    expect(result.current.busy).toBe(false);
  });

  it('reports an event snapshot error from initial dashboard loading', async () => {
    mockDashboard(recent);
    vi.spyOn(api, 'getTournament').mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Event disappeared.'));
    const { result } = renderHook(() => useTournamentDesk());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Event disappeared.');
    expect(result.current.tournament).toBeNull();
  });
});

function mockDashboard(tournaments: TournamentRecord[], firstSnapshot?: TournamentSnapshot): void {
  vi.spyOn(api, 'getFormats').mockResolvedValue(formats);
  vi.spyOn(api, 'getTournaments').mockResolvedValue(tournaments);
  vi.spyOn(api, 'getTournament').mockResolvedValue(firstSnapshot ?? original);
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => { resolve = done; });
  return { promise, resolve };
}
