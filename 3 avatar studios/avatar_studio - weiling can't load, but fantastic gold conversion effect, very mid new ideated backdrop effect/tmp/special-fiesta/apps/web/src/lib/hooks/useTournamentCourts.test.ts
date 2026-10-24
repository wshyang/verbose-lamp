import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';
import { consoleView } from '../../test-utils/tournamentFixtures.js';
import { useTournamentDesk } from './useTournamentDesk.js';
import { courtBodyOf, useTournamentCourts } from './useTournamentCourts.js';

/**
 * ADR-288 — the venue's courts at the desk (fds S41–S43): add one, rename or renumber one, switch one
 * on or off. Each write answers with the whole Control read, which the desk then shows.
 */

let stub: FetchStub;
afterEach(() => stub?.restore());

function renderCourts() {
  return renderHook(() => {
    const desk = useTournamentDesk();
    return { desk, courts: useTournamentCourts(desk) };
  });
}

describe('courtBodyOf', () => {
  it('sends the number as a number and the label trimmed', () => {
    expect(courtBodyOf({ courtNumber: '4', label: '  Court 4 ' })).toEqual({ courtNumber: 4, label: 'Court 4' });
  });
});

describe('useTournamentCourts', () => {
  it('adds a court and clears the form once the desk has it', async () => {
    const added = { ...consoleView(null), courts: [...consoleView(null).courts, { id: 'c2', courtNumber: 2, label: 'Court 2', isEnabled: true }] };
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'POST /api/admin/tournament/courts': { status: 201, body: added },
    });
    const { result } = renderCourts();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.courts.update({ courtNumber: '2', label: 'Court 2' }));
    await act(async () => void (await result.current.courts.submit()));
    expect(stub.callsTo('POST /api/admin/tournament/courts')[0]?.body).toEqual({ courtNumber: 2, label: 'Court 2' });
    expect(result.current.desk.courts.map((court) => court.label)).toEqual(['Court 1', 'Court 2']);
    expect(result.current.courts.draft).toEqual({ courtNumber: '', label: '' });
  });

  it('edits the court picked, keeps the form on a refusal, and lets the edit be abandoned', async () => {
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'PUT /api/admin/tournament/courts/c1': { status: 409, body: { error: { message: 'Another court already has that number.' } } },
    });
    const { result } = renderCourts();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    act(() => result.current.courts.beginEdit(result.current.desk.courts[0]!));
    expect(result.current.courts.editingId).toBe('c1');
    expect(result.current.courts.draft).toEqual({ courtNumber: '1', label: 'Court 1' });
    act(() => result.current.courts.update({ courtNumber: '3' }));
    await act(async () => void (await result.current.courts.submit()));
    expect(stub.callsTo('PUT /api/admin/tournament/courts/c1')[0]?.body).toEqual({ courtNumber: 3, label: 'Court 1' });
    expect(result.current.desk.error).toBe('Another court already has that number.');
    expect(result.current.courts.editingId).toBe('c1');
    act(() => result.current.courts.cancelEdit());
    expect(result.current.courts.editingId).toBeNull();
    expect(result.current.courts.draft).toEqual({ courtNumber: '', label: '' });
  });

  it('switches a court off with the flag the API reads', async () => {
    const off = { ...consoleView(null), courts: [{ id: 'c1', courtNumber: 1, label: 'Court 1', isEnabled: false }] };
    stub = installFetchStub({
      'GET /api/admin/tournament': { body: consoleView(null) },
      'PATCH /api/admin/tournament/courts/c1/enabled': { body: off },
    });
    const { result } = renderCourts();
    await waitFor(() => expect(result.current.desk.isLoading).toBe(false));
    await act(async () => void (await result.current.courts.toggle(result.current.desk.courts[0]!)));
    expect(stub.callsTo('PATCH /api/admin/tournament/courts/c1/enabled')[0]?.body).toEqual({ isEnabled: false });
    expect(result.current.desk.courts[0]?.isEnabled).toBe(false);
  });
});
