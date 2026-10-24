import type {
  ApiErrorBody,
  AwardPointsInput,
  CreateTournamentInput,
  FinalizeMatchInput,
  FormatDescriptor,
  LiveScoreInput,
  PreviewInput,
  SimulationResult,
  StageMatchInput,
  TournamentRecord,
  TournamentSnapshot,
  WeatherChangeInput,
} from '../shared/contracts.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  getFormats: () => request<FormatDescriptor[]>('/api/formats'),
  getTournaments: () => request<TournamentRecord[]>('/api/tournaments'),
  preview: (input: PreviewInput) => request<SimulationResult>('/api/simulations', jsonRequest('POST', input)),
  createTournament: (input: CreateTournamentInput) =>
    request<TournamentSnapshot>('/api/tournaments', jsonRequest('POST', input)),
  getTournament: (tournamentId: string) =>
    request<TournamentSnapshot>(`/api/tournaments/${encodeURIComponent(tournamentId)}`),
  changeResources: (tournamentId: string, input: WeatherChangeInput) =>
    request<TournamentSnapshot>(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/resources`,
      jsonRequest('PATCH', input),
    ),
  stageMatch: (tournamentId: string, input: StageMatchInput) =>
    request<TournamentSnapshot>(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/matches`,
      jsonRequest('POST', input),
    ),
  updateLiveScore: (tournamentId: string, matchId: string, input: LiveScoreInput) =>
    request<TournamentSnapshot>(
      matchPath(tournamentId, matchId, 'score'),
      jsonRequest('POST', input),
    ),
  finalizeMatch: (tournamentId: string, matchId: string, input: FinalizeMatchInput) =>
    request<TournamentSnapshot>(
      matchPath(tournamentId, matchId, 'finalize'),
      jsonRequest('POST', input),
    ),
  awardPoints: (tournamentId: string, input: AwardPointsInput) =>
    request<TournamentSnapshot>(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/points`,
      jsonRequest('POST', input),
    ),
  voidPointAward: (tournamentId: string, entryId: string, reason: string) =>
    request<TournamentSnapshot>(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/points/${encodeURIComponent(entryId)}/void`,
      jsonRequest('POST', { reason }),
    ),
  closeTournament: (tournamentId: string, reason: string) =>
    request<TournamentSnapshot>(
      `/api/tournaments/${encodeURIComponent(tournamentId)}/close`,
      jsonRequest('POST', { reason }),
    ),
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json();
  if (!response.ok) throw createApiError(response.status, payload);
  return payload as T;
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function createApiError(status: number, payload: unknown): ApiError {
  const body = payload as Partial<ApiErrorBody> | null;
  const detail = body?.error;
  return new ApiError(
    status,
    detail?.code ?? 'REQUEST_FAILED',
    detail?.message ?? 'The request could not be completed.',
  );
}

function matchPath(tournamentId: string, matchId: string, action: string): string {
  return `/api/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}/${action}`;
}
