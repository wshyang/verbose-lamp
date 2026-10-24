import { useCallback, useState } from 'react';
import { fetchAdminParticipants, fetchAdminTeams, fetchParticipantDetail } from '../api/admin.js';
import { useAsyncData } from './useAsyncData.js';

/** S52 participant directory, S53 participant detail, S54 team directory. */

export function useAdminParticipants() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  /*
   * ADR-164 — the cluster applies immediately, where the search waits for a submit. They are
   * used differently: the box is typed into and then sent, the dropdown IS the decision. A
   * desk operator helping somebody find a nickname they have forgotten picks the cluster and
   * expects the list to be the cluster.
   */
  const [clusterCode, setClusterCode] = useState('');
  const loader = useCallback(
    () => fetchAdminParticipants(applied, clusterCode),
    [applied, clusterCode],
  );
  const state = useAsyncData(loader);

  return {
    rows: state.data?.items ?? [],
    search,
    setSearch,
    applySearch: () => setApplied(search.trim()),
    clusterCode,
    setClusterCode,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

export function useParticipantDetail(participantId: string) {
  const state = useAsyncData(useCallback(() => fetchParticipantDetail(participantId), [participantId]));
  return {
    participant: state.data?.participant ?? null,
    totals: state.data?.totals ?? null,
    team: state.data?.team ?? null,
    scans: state.data?.scans ?? [],
    adjustments: state.data?.adjustments ?? [],
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

export function useAdminTeams() {
  const state = useAsyncData(useCallback(() => fetchAdminTeams(), []));
  return {
    rows: state.data?.items ?? [],
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
