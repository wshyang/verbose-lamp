import { useCallback, useEffect, useState } from 'react';
import { api, type CreateTournamentInput, type ManualMatchInput } from '../api.js';
import type { TournamentGraph } from '../../../../shared/types.js';

export interface DeskState {
  graph: TournamentGraph | null;
  tournaments: TournamentGraph['tournament'][];
  error: string | null;
  isLoading: boolean;
  selectTournament: (id: string) => Promise<void>;
  refreshTournaments: () => Promise<void>;
  createTournament: (input: CreateTournamentInput) => Promise<void>;
  stageManualMatch: (input: ManualMatchInput) => Promise<void>;
  startMatch: (matchId: string) => Promise<void>;
  scoreMatch: (matchId: string, scoreA: number, scoreB: number) => Promise<void>;
  finaliseMatch: (matchId: string) => Promise<void>;
  cancelMatch: (matchId: string) => Promise<void>;
  assignPoints: (teamId: string, points: number, reason: string) => Promise<void>;
  voidPoints: (entryId: string, reason: string) => Promise<void>;
  applyContingency: (courts: number, matchLengthMinutes: number) => Promise<void>;
  closeTournament: () => Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

export function useDesk(): DeskState {
  const [graph, setGraph] = useState<TournamentGraph | null>(null);
  const [tournaments, setTournaments] = useState<TournamentGraph['tournament'][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const applyGraph = useCallback(async (action: () => Promise<TournamentGraph>): Promise<void> => {
    setIsLoading(true);
    try {
      const next = await action();
      setGraph(next);
      setError(null);
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsLoading(false);
  }, []);

  const refreshTournaments = useCallback(async (): Promise<void> => {
    try {
      setTournaments(await api.listTournaments());
    } catch (caught) {
      setError(messageOf(caught));
    }
  }, []);

  useEffect(() => {
    void refreshTournaments();
  }, [refreshTournaments]);

  const selectTournament = useCallback(async (id: string): Promise<void> => {
    await applyGraph(() => api.getTournament(id));
  }, [applyGraph]);

  const createTournament = useCallback(async (input: CreateTournamentInput): Promise<void> => {
    await applyGraph(() => api.createTournament(input));
    await refreshTournaments();
  }, [applyGraph, refreshTournaments]);

  const withTournament = useCallback((action: (id: string) => Promise<TournamentGraph>) => {
    return async (): Promise<void> => {
      if (graph === null) {
        setError('Open a tournament first');
        return;
      }
      await applyGraph(() => action(graph.tournament.id));
    };
  }, [applyGraph, graph]);

  const stageManualMatch = useCallback(async (input: ManualMatchInput): Promise<void> => {
    await withTournament((id) => api.stageManualMatch(id, input))();
  }, [withTournament]);

  const assignPoints = useCallback(async (teamId: string, points: number, reason: string): Promise<void> => {
    await withTournament((id) => api.assignPoints(id, teamId, points, reason))();
  }, [withTournament]);

  const applyContingency = useCallback(async (courts: number, matchLengthMinutes: number): Promise<void> => {
    await withTournament((id) => api.applyContingency(id, courts, matchLengthMinutes))();
  }, [withTournament]);

  const closeTournament = useCallback(async (): Promise<void> => {
    await withTournament((id) => api.closeTournament(id))();
    await refreshTournaments();
  }, [withTournament, refreshTournaments]);

  return {
    graph, tournaments, error, isLoading,
    selectTournament, refreshTournaments, createTournament, stageManualMatch,
    startMatch: (matchId) => applyGraph(() => api.startMatch(matchId)),
    scoreMatch: (matchId, scoreA, scoreB) => applyGraph(() => api.scoreMatch(matchId, scoreA, scoreB)),
    finaliseMatch: (matchId) => applyGraph(() => api.finaliseMatch(matchId)),
    cancelMatch: (matchId) => applyGraph(() => api.cancelMatch(matchId)),
    assignPoints, voidPoints: (entryId, reason) => applyGraph(() => api.voidPoints(entryId, reason)),
    applyContingency, closeTournament,
  };
}
