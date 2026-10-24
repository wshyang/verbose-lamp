import { useCallback } from 'react';
import { fetchFinalStandings } from '../api/admin.js';
import { useAsyncData } from './useAsyncData.js';
import { clustersCsv, downloadCsv, individualsCsv, teamsCsv } from '../standingsCsv.js';
import type { FinalStandingsView } from '@psd/contracts';

/** ADR-161 — one read behind the printed sheet and all three downloads. */
export function useFinalStandings() {
  const state = useAsyncData(useCallback(async () => (await fetchFinalStandings()).standings, []));
  const standings = state.data;
  const download = (build: (view: FinalStandingsView) => ReturnType<typeof clustersCsv>) => {
    if (standings !== null) downloadCsv(build(standings));
  };
  return {
    standings,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
    downloadClusters: () => download(clustersCsv),
    downloadIndividuals: () => download(individualsCsv),
    downloadTeams: () => download(teamsCsv),
  };
}
