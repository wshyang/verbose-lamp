import { useCallback, useMemo, useState } from 'react';
import type { ClusterCode } from '@psd/contracts';
import { fetchClusterNicknames, fetchClusters } from '../api/participants.js';
import { useAsyncData } from './useAsyncData.js';

/**
 * ADR-164 — finding a nickname you chose this morning and cannot now remember.
 *
 * The state is small but the shape of it is the feature. Nothing is fetched until a cluster is
 * chosen, because "every nickname at the event" is not an answer anybody can read; and the
 * typed filter runs **in the browser over the list already fetched**, not as another request,
 * so a half-remembered first letter narrows instantly and a wrong guess costs nothing. Somebody
 * standing at a sign-up desk trying to recall whether they were `BeachBoss` or `Beach_Boss`
 * needs to be able to try both in the same second.
 *
 * Matched on `includes`, not a prefix: the fragment people retain is as often the end of the
 * word as the start of it.
 */
export interface NicknameFinder {
  clusters: { code: string; displayName: string }[];
  clusterCode: string;
  chooseCluster: (code: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  /** Null until a cluster has been chosen — the difference between "none" and "not yet asked". */
  matches: string[] | null;
  isLoading: boolean;
  error: string | null;
}

export function useNicknameFinder(): NicknameFinder {
  const [clusterCode, setClusterCode] = useState('');
  const [filter, setFilter] = useState('');
  const clusters = useAsyncData(useCallback(() => fetchClusters(), []));

  const loader = useCallback(
    () => (clusterCode === '' ? Promise.resolve({ nicknames: [] }) : fetchClusterNicknames(clusterCode)),
    [clusterCode],
  );
  const found = useAsyncData(loader);

  const chooseCluster = useCallback((code: string) => {
    setClusterCode(code as ClusterCode);
    // A filter typed against one cluster's list means nothing against another's.
    setFilter('');
  }, []);

  const matches = useMemo(() => {
    if (clusterCode === '' || found.data === null) return null;
    const needle = filter.trim().toLowerCase();
    if (needle === '') return found.data.nicknames;
    return found.data.nicknames.filter((nickname) => nickname.toLowerCase().includes(needle));
  }, [clusterCode, filter, found.data]);

  return {
    clusters: clusters.data?.items ?? [],
    clusterCode,
    chooseCluster,
    filter,
    setFilter,
    matches,
    isLoading: clusterCode !== '' && found.isLoading,
    error: found.error ?? clusters.error,
  };
}
