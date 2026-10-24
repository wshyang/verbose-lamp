import { useCallback, useMemo, useState } from 'react';
import { messages } from '@psd/contracts';
import type { ScanView, SwagClaimView } from '@psd/contracts';
import { fetchAdminScans, fetchVoidAudit, unvoidScan, voidScan } from '../api/admin.js';
import { fetchAdminSwagClaims, unvoidSwagClaim, voidSwagClaim } from '../api/swag.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';

/**
 * S50–S51 + S55 — corrections. Every mutation here is reversible and every one demands a
 * reason, which is why the reason lives in hook state and is validated before the call
 * (fds.md F45–F48, §2.13). ADR-270 — the match corrections left with the old tournament.
 */

const MIN_REASON_LENGTH = 3;

export type CorrectionKind =
  | 'void-scan'
  | 'unvoid-scan'
  // ADR-159 — the handout, reversible at last.
  | 'void-claim'
  | 'unvoid-claim';

export interface CorrectionTarget {
  kind: CorrectionKind;
  id: string;
  title: string;
}

/**
 * The confirm dialog shared by the scan and swag correction screens: which row is being
 * corrected, the mandatory reason, and the validation message that belongs beside the input.
 */
function useCorrectionDialog(onCorrected: () => void) {
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const openCorrection = useCallback((next: CorrectionTarget) => {
    setTarget(next);
    setReason('');
    setLocalError(null);
  }, []);

  const afterCorrection = useCallback(() => {
    setTarget(null);
    setReason('');
    setLocalError(null);
    onCorrected();
  }, [onCorrected]);

  return {
    target,
    reason,
    setReason,
    localError,
    setLocalError,
    openCorrection,
    afterCorrection,
    closeDialog: () => {
      setTarget(null);
      setLocalError(null);
    },
    /** null once the reason is long enough to be a real explanation in the audit log. */
    reasonProblem: () => (reason.trim().length < MIN_REASON_LENGTH ? messages.voidReasonRequired : null),
  };
}

export function useScanCorrections() {
  const [activityFilter, setActivityFilter] = useState('');
  const state = useAsyncData(
    useCallback(() => fetchAdminScans(activityFilter || undefined), [activityFilter]),
  );
  const stateReload = state.reload;
  const dialog = useCorrectionDialog(stateReload);
  const doVoid = useAction(voidScan, dialog.afterCorrection);
  const doUnvoid = useAction(unvoidScan, dialog.afterCorrection);
  const { run: voidIt } = doVoid;
  const { run: unvoidIt } = doUnvoid;
  const { target, reason, reasonProblem, setLocalError } = dialog;

  const confirm = useCallback(async () => {
    if (!target) return;
    const problem = reasonProblem();
    if (problem) {
      setLocalError(problem);
      return;
    }
    const input = { scanId: target.id, reason: reason.trim() };
    if (target.kind === 'void-scan') await voidIt(input);
    else await unvoidIt(input);
  }, [reason, reasonProblem, setLocalError, target, unvoidIt, voidIt]);

  const scans: ScanView[] = useMemo(() => state.data?.items ?? [], [state.data]);
  const activityOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const scan of scans) seen.set(scan.activityId, scan.activityNameSnapshot);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [scans]);

  return {
    scans,
    activityOptions,
    activityFilter,
    setActivityFilter,
    target: dialog.target,
    openCorrection: dialog.openCorrection,
    closeDialog: dialog.closeDialog,
    reason: dialog.reason,
    setReason: dialog.setReason,
    confirm,
    isBusy: doVoid.isPending || doUnvoid.isPending,
    isLoading: state.isLoading,
    error: state.error,
    dialogError: firstError([dialog.localError, doVoid.error, doUnvoid.error]),
    reload: stateReload,
  };
}

/**
 * ADR-159 — swag claim corrections, deliberately the scan hook's twin.
 *
 * The one asymmetry worth naming: voiding a claim gives the participant their allowance
 * back, which is the point of the feature, and unvoiding spends it again. Neither is
 * visible from this hook — the server owns it — but it is why the list reloads after every
 * correction rather than patching the row in place.
 */
export function useSwagClaimCorrections() {
  const [stationFilter, setStationFilter] = useState('');
  const state = useAsyncData(
    useCallback(() => fetchAdminSwagClaims(stationFilter || undefined), [stationFilter]),
  );
  const stateReload = state.reload;
  const dialog = useCorrectionDialog(stateReload);
  const doVoid = useAction(voidSwagClaim, dialog.afterCorrection);
  const doUnvoid = useAction(unvoidSwagClaim, dialog.afterCorrection);
  const { run: voidIt } = doVoid;
  const { run: unvoidIt } = doUnvoid;
  const { target, reason, reasonProblem, setLocalError } = dialog;

  const confirm = useCallback(async () => {
    if (!target) return;
    const problem = reasonProblem();
    if (problem) {
      setLocalError(problem);
      return;
    }
    const input = { claimId: target.id, reason: reason.trim() };
    if (target.kind === 'void-claim') await voidIt(input);
    else await unvoidIt(input);
  }, [reason, reasonProblem, setLocalError, target, unvoidIt, voidIt]);

  const claims: SwagClaimView[] = useMemo(() => state.data?.items ?? [], [state.data]);
  const stationOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const claim of claims) seen.set(claim.stationId, claim.stationNameSnapshot);
    return [...seen.entries()].map(([id, label]) => ({ id, label }));
  }, [claims]);

  return {
    claims,
    stationOptions,
    stationFilter,
    setStationFilter,
    target: dialog.target,
    openCorrection: dialog.openCorrection,
    closeDialog: dialog.closeDialog,
    reason: dialog.reason,
    setReason: dialog.setReason,
    confirm,
    isBusy: doVoid.isPending || doUnvoid.isPending,
    isLoading: state.isLoading,
    error: state.error,
    dialogError: firstError([dialog.localError, doVoid.error, doUnvoid.error]),
    reload: stateReload,
  };
}

export function useVoidAudit() {
  const state = useAsyncData(useCallback(() => fetchVoidAudit(), []));
  return {
    entries: state.data?.items ?? [],
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}
