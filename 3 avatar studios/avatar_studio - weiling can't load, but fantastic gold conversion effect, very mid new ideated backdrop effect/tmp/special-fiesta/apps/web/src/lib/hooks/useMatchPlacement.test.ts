import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { adminMatch, adminTournament, consoleView } from '../../test-utils/tournamentFixtures.js';
import { useTournamentDesk } from './useTournamentDesk.js';
import { clockOfInstant, useMatchPlacement } from './useMatchPlacement.js';

/**
 * ADR-289 — requirement 9 at the desk: a person puts a queued match on a court at a time (and, while
 * the scheduler runs, it keeps it there), or hands a pinned match back to the planner.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

const queued = adminMatch({ id: 'm1', courtId: 'c1', plannedStartAt: '2026-10-15T02:00:00.000Z' });
const pinned = adminMatch({ id: 'm2', isPinned: true });

function renderPlacement() {
  return renderHook(() => {
    const desk = useTournamentDesk();
    return { desk, placement: useMatchPlacement(desk) };
  });
}

describe('clockOfInstant', () => {
  it('reads an instant back as the local HH:MM the time field shows', () => {
    const at = new Date(2026, 9, 15, 9, 5);
    expect(clockOfInstant(at.toISOString())).toBe('09:05');
    expect(clockOfInstant(null)).toBe('');
  });
});

describe('useMatchPlacement', () => {
  it('opens on the match where it stands, and moves it to the court and time picked', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(adminTournament({ matches: [queued] })) },
      'POST /api/admin/tournament/matches/m1/move': { body: consoleView(adminTournament({ matches: [{ ...queued, isPinned: true }] })) },
    });
    const { result } = renderPlacement();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.placement.open(queued));
    expect(result.current.placement.matchId).toBe('m1');
    expect(result.current.placement.draft.courtId).toBe('c1');
    act(() => result.current.placement.update({ time: '10:30' }));
    await act(async () => void (await result.current.placement.confirm()));
    const sent = stub.callsTo('POST /api/admin/tournament/matches/m1/move')[0]?.body as { courtId: string; startAt: string };
    expect(sent.courtId).toBe('c1');
    expect(new Date(sent.startAt).getHours()).toBe(10);
    expect(new Date(sent.startAt).getMinutes()).toBe(30);
    expect(result.current.placement.matchId).toBeNull();
    expect(result.current.desk.tournament?.matches[0]?.isPinned).toBe(true);
  });

  it('refuses a time it cannot read without asking the API, and stays open on a refusal', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(adminTournament({ matches: [queued] })) },
      'POST /api/admin/tournament/matches/m1/move': { status: 409, body: { error: { message: 'That court is not available.' } } },
    });
    const { result } = renderPlacement();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.placement.open(queued));
    act(() => result.current.placement.update({ time: 'soon' }));
    await act(async () => void (await result.current.placement.confirm()));
    expect(result.current.placement.problem).toBe('Pick a start time.');
    expect(stub.callsTo('POST /api/admin/tournament/matches/m1/move')).toHaveLength(0);
    act(() => result.current.placement.update({ time: '11:00', courtId: '' }));
    await act(async () => void (await result.current.placement.confirm()));
    expect(result.current.placement.problem).toBe('Pick a court.');
    act(() => result.current.placement.update({ courtId: 'c1' }));
    await act(async () => void (await result.current.placement.confirm()));
    expect(result.current.desk.error).toBe('That court is not available.');
    expect(result.current.placement.matchId).toBe('m1');
    act(() => result.current.placement.cancel());
    expect(result.current.placement.matchId).toBeNull();
  });

  it('hands a pinned match back to the planner', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(adminTournament({ matches: [pinned] })) },
      'POST /api/admin/tournament/matches/m2/release': { body: consoleView(adminTournament({ matches: [{ ...pinned, isPinned: false }] })) },
    });
    const { result } = renderPlacement();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    await act(async () => void (await result.current.placement.release(pinned)));
    expect(stub.callsTo('POST /api/admin/tournament/matches/m2/release')).toHaveLength(1);
    expect(result.current.desk.tournament?.matches[0]?.isPinned).toBe(false);
  });
});
