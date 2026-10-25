import { useCallback, useMemo, useState } from 'react';
import {
  createCluster,
  fetchAdminClusters,
  reassignCluster,
  renameCluster,
  setClusterRetired,
} from '../api/admin.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';

/**
 * ADR-172 — S44 the cluster catalogue.
 *
 * Its own hook rather than another branch of `useAdminConfig`, because the catalogue has a rule
 * none of the other config surfaces has: two of its actions are locked once scoring starts, and
 * one of them is refused while the cluster still has members. Both are facts the page has to
 * show, not just discover by being told no.
 */

export interface ClusterDraft {
  code: string;
  displayName: string;
}

const EMPTY_DRAFT: ClusterDraft = { code: '', displayName: '' };

/**
 * The add/rename form's own state. Split out because the catalogue hook was over the function
 * length limit, and this is the seam that leaves both halves readable: the form knows about a
 * draft and which row is being renamed, and nothing else does.
 */
function useClusterDraft(reload: () => void) {
  const [draft, setDraft] = useState<ClusterDraft>(EMPTY_DRAFT);
  const [renamingCode, setRenamingCode] = useState<string | null>(null);

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setRenamingCode(null);
    reload();
  }, [reload]);

  const cancelRename = useCallback(() => {
    setRenamingCode(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  return { draft, setDraft, renamingCode, setRenamingCode, reset, cancelRename };
}

export function useAdminClusters() {
  const state = useAsyncData(useCallback(() => fetchAdminClusters(), []));
  const reload = state.reload;

  const clusters = useMemo(() => state.data?.items ?? [], [state.data]);
  const scoringStarted = state.data?.scoringStarted ?? false;

  const form = useClusterDraft(reload);
  const { draft, renamingCode, setDraft, setRenamingCode } = form;
  const resetDraft = form.reset;

  const create = useAction(createCluster, resetDraft);
  const rename = useAction(renameCluster, resetDraft);
  const retire = useAction(setClusterRetired, reload);
  const move = useAction(reassignCluster, reload);

  const submitDraft = useCallback(async () => {
    if (renamingCode) await rename.run({ code: renamingCode, displayName: draft.displayName });
    else await create.run({ code: draft.code.trim(), displayName: draft.displayName.trim() });
  }, [create, draft, renamingCode, rename]);

  const beginRename = useCallback(
    (code: string) => {
      const existing = clusters.find((cluster) => cluster.code === code);
      if (!existing) return;
      setRenamingCode(code);
      setDraft({ code: existing.code, displayName: existing.displayName });
    },
    [clusters, setDraft, setRenamingCode],
  );

  /**
   * Where a cluster's members can be sent: open clusters, minus itself. A retired cluster is
   * excluded because moving people into one would immediately re-break the rule that a retired
   * cluster is empty.
   */
  const moveTargets = useCallback(
    (code: string) => clusters.filter((cluster) => !cluster.isRetired && cluster.code !== code),
    [clusters],
  );

  return {
    clusters,
    scoringStarted,
    draft,
    setDraft,
    renamingCode,
    beginRename,
    cancelRename: form.cancelRename,
    submitDraft,
    moveTargets,
    setRetired: (input: { code: string; isRetired: boolean }) => void retire.run(input),
    reassign: (input: { code: string; toClusterCode: string }) => void move.run(input),
    isBusy: create.isPending || rename.isPending || retire.isPending || move.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, rename.error, retire.error, move.error]),
    reload,
  };
}
