import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api.js';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('relative-URL API client', () => {
  it('uses GET for catalog and event reads', async () => {
    await api.getFormats();
    await api.getTournaments();
    await api.getTournament('event/one');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/formats',
      '/api/tournaments',
      '/api/tournaments/event%2Fone',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init === undefined)).toBe(true);
  });

  it('posts previews and creates with JSON request bodies', async () => {
    const input = { mode: 'manual' as const, settings: { teamCount: 2, courtCount: 1, matchDurationMinutes: 20, tournamentLengthMinutes: 120, startTimeMinutes: 540 }, teamNames: ['North', 'South'] };
    await api.preview(input);
    await api.createTournament({ ...input, name: 'Cup' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/simulations');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/tournaments');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ ...input, name: 'Cup' }) });
  });

  it('patches weather and posts manual staging', async () => {
    await api.changeResources('event 1', { courtCount: 1, matchDurationMinutes: 25, effectiveAtMinutes: 600 });
    await api.stageMatch('event 1', { homeTeamId: 'home', awayTeamId: 'away' });
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/tournaments/event%201/resources',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ courtCount: 1, matchDurationMinutes: 25, effectiveAtMinutes: 600 }) }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/tournaments/event%201/matches',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ homeTeamId: 'home', awayTeamId: 'away' }) }),
    ]);
  });

  it('encodes match IDs and sends scores, final decisions, and points entries', async () => {
    await api.updateLiveScore('event/1', 'match 1', { home: 3, away: 1 });
    await api.finalizeMatch('event/1', 'match 1', { home: 3, away: 1, advancingTeamId: 'home' });
    await api.awardPoints('event/1', { teamId: 'home', points: 4, reason: 'Effort', matchId: 'match 1' });
    await api.voidPointAward('event/1', 'entry/1', 'Entered in error');
    await api.closeTournament('event/1', 'Weather');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/tournaments/event%2F1/matches/match%201/score',
      '/api/tournaments/event%2F1/matches/match%201/finalize',
      '/api/tournaments/event%2F1/points',
      '/api/tournaments/event%2F1/points/entry%2F1/void',
      '/api/tournaments/event%2F1/close',
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST', 'POST', 'POST', 'POST']);
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string)).toEqual({ reason: 'Entered in error' });
  });

  it('uses server error details when available and stable fallbacks when absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { error: { code: 'INVALID_INPUT', message: 'Choose a format.' } }, false));
    await expect(api.getFormats()).rejects.toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'INVALID_INPUT',
      message: 'Choose a format.',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { code: 'OFFLINE' } }, false));
    await expect(api.getFormats()).rejects.toMatchObject({
      status: 503,
      code: 'OFFLINE',
      message: 'The request could not be completed.',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(500, null, false));
    const genericError = await api.getFormats().catch((error: unknown) => error);
    expect(genericError).toBeInstanceOf(ApiError);
    expect(genericError).toMatchObject({
      status: 500,
      code: 'REQUEST_FAILED',
      message: 'The request could not be completed.',
    });
  });
});

function jsonResponse(status: number, payload: unknown, ok = true): Response {
  return { status, ok, json: async () => payload } as Response;
}
