// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

function mockFetch(ok: boolean, status: number, text: string) {
  const fetchMock = vi.fn(async () => ({ ok, status, text: async () => text }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('calls every endpoint with the right method and path', async () => {
    const fetchMock = mockFetch(true, 200, '{"ok":true}');
    const config = {
      courts: 2, matchLengthMinutes: 20, tournamentLengthMinutes: 480,
      startMinutes: 540, restMinutes: 5, winPoints: 3, drawPoints: 1, lossPoints: 0,
    };
    await api.listTournaments();
    await api.getTournament('t1');
    await api.createTournament({ name: 'Cup', mode: 'round-robin', teamNames: ['A', 'B'], config });
    await api.stageManualMatch('t1', { teamAId: 'a', teamBId: 'b' });
    await api.startMatch('m1');
    await api.scoreMatch('m1', 4, 2);
    await api.finaliseMatch('m1');
    await api.cancelMatch('m1');
    await api.assignPoints('t1', 'a', 3, 'Win');
    await api.voidPoints('p1', 'Mistake');
    await api.applyContingency('t1', 1, 10);
    await api.closeTournament('t1');
    const rawCalls = fetchMock.mock.calls as unknown as [string, { method: string }][];
    const calls = rawCalls.map((call) => `${call[1].method} ${call[0]}`);
    expect(calls).toEqual([
      'GET /api/tournaments',
      'GET /api/tournaments/t1',
      'POST /api/tournaments',
      'POST /api/tournaments/t1/matches',
      'POST /api/matches/m1/start',
      'PATCH /api/matches/m1/score',
      'POST /api/matches/m1/finalise',
      'POST /api/matches/m1/cancel',
      'POST /api/tournaments/t1/points',
      'POST /api/points/p1/void',
      'POST /api/tournaments/t1/contingency',
      'POST /api/tournaments/t1/close',
    ]);
  });

  it('throws the server error message on failure', async () => {
    mockFetch(false, 409, '{"error":"Match is already final"}');
    await expect(api.startMatch('m1')).rejects.toThrow('Match is already final');
  });

  it('falls back to a status message when no error field exists', async () => {
    mockFetch(false, 500, '{}');
    await expect(api.listTournaments()).rejects.toThrow('Request failed (500)');
  });

  it('treats an empty body as an empty object', async () => {
    mockFetch(true, 200, '');
    await expect(api.listTournaments()).resolves.toEqual({});
  });
});
