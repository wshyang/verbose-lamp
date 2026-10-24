import type { TournamentConfig, TournamentGraph } from '../../../shared/types.js';

export interface CreateTournamentInput {
  name: string;
  mode: string;
  teamNames: string[];
  config: TournamentConfig;
}

export interface ManualMatchInput {
  teamAId: string;
  teamBId: string;
  courtId?: string;
  startMinutes?: number;
  phase?: string;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = (text === '' ? {} : JSON.parse(text)) as { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  listTournaments: () => request<TournamentGraph['tournament'][]>('GET', '/api/tournaments'),
  getTournament: (id: string) => request<TournamentGraph>('GET', `/api/tournaments/${id}`),
  createTournament: (input: CreateTournamentInput) => request<TournamentGraph>('POST', '/api/tournaments', input),
  stageManualMatch: (tournamentId: string, input: ManualMatchInput) =>
    request<TournamentGraph>('POST', `/api/tournaments/${tournamentId}/matches`, input),
  startMatch: (matchId: string) => request<TournamentGraph>('POST', `/api/matches/${matchId}/start`),
  scoreMatch: (matchId: string, scoreA: number, scoreB: number) =>
    request<TournamentGraph>('PATCH', `/api/matches/${matchId}/score`, { scoreA, scoreB }),
  finaliseMatch: (matchId: string) => request<TournamentGraph>('POST', `/api/matches/${matchId}/finalise`),
  cancelMatch: (matchId: string) => request<TournamentGraph>('POST', `/api/matches/${matchId}/cancel`),
  assignPoints: (tournamentId: string, teamId: string, points: number, reason: string) =>
    request<TournamentGraph>('POST', `/api/tournaments/${tournamentId}/points`, { teamId, points, reason }),
  voidPoints: (entryId: string, reason: string) =>
    request<TournamentGraph>('POST', `/api/points/${entryId}/void`, { reason }),
  applyContingency: (tournamentId: string, courts: number, matchLengthMinutes: number) =>
    request<TournamentGraph>('POST', `/api/tournaments/${tournamentId}/contingency`, { courts, matchLengthMinutes }),
  closeTournament: (tournamentId: string) =>
    request<TournamentGraph>('POST', `/api/tournaments/${tournamentId}/close`),
};
