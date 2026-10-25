import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PARTICIPATION_LABEL,
  SCAN_NUMBER_PATTERN,
  SCAN_UNDO_WINDOW_SECONDS,
  messages,
} from '@psd/contracts';
import type { ActivityView, AwardTier, ParticipantView, RoundView, ScanView } from '@psd/contracts';
import { ApiError, OfflineError } from '../api/client.js';
import {
  advanceRound,
  endRound,
  fetchActivity,
  fetchRoundScans,
  findParticipantByNumber,
  openRound,
  postScan,
  reactivateRound,
  undoScan,
} from '../api/stations.js';
import { scanConfirmation } from '../format.js';
import { enqueueScan, newClientScanUuid, removeFromQueue } from '../offline/scanQueue.js';
import { useAction } from './useAction.js';
import { describeError, firstError, useAsyncData, usePolling } from './useAsyncData.js';
import { useSync } from '../session/syncContext.js';

/**
 * S25–S31 — the fringe station console: round lifecycle plus the scan submit path.
 *
 * fds.md F27 + DC-004: a scan that cannot reach the server is queued locally and confirmed
 * immediately. The facilitator never waits on the network and never re-scans a participant
 * "just in case" — the queued entry carries the same idempotency key the retry will use.
 */


export interface ScanOutcome {
  /**
   * ADR-116 — `held` is new: a different award already holds this participant's slot in the
   * round. It is not a duplicate (that is the same scan arriving twice, and still a no-op) and
   * it is not a rejection, because the facilitator can resolve it by replacing the award.
   */
  kind: 'awarded' | 'duplicate' | 'held' | 'queued' | 'rejected' | 'undone';
  message: string;
  /**
   * ADR-138 — present only on an outcome that actually moved points, and only for as long as
   * the station may take them back. The handle says WHERE the scan currently lives, because
   * that decides what undoing it means: a scan the server took is voided by the server (which
   * owns the clock and the last word), while a queued scan exists nowhere else, so dropping
   * the queue entry is the whole of the undo. `expiresAt` is for the countdown only — the
   * server re-checks the window, and a queued entry past it may already have drained.
   */
  undo?: UndoHandle;
}

export type UndoHandle = { expiresAt: number } & (
  | { scanId: string; clientScanUuid?: undefined }
  | { clientScanUuid: string; scanId?: undefined }
);

function undoWindowEnd(): number {
  return Date.now() + SCAN_UNDO_WINDOW_SECONDS * 1000;
}

interface ScanAttempt {
  nickname: string;
  roundId: string;
  /** ADR-116 — null is the participation award: took part, did not place. */
  tierLabel: string | null;
  replaceExisting?: boolean;
  clientScanUuid: string;
  clientTimestamp: string;
}

function newAttempt(input: {
  nickname: string;
  roundId: string;
  tierLabel: string | null;
}): ScanAttempt {
  return {
    nickname: input.nickname,
    roundId: input.roundId,
    tierLabel: input.tierLabel,
    clientScanUuid: newClientScanUuid(),
    clientTimestamp: new Date().toISOString(),
  };
}

/**
 * The ✓ line names the tier only where a choice existed — a flat station reads as it always
 * did. ADR-116: a participation award always names itself, because it is never one of the
 * station's configured tiers and "+5 pts" alone would not say why.
 */
function shownTierLabel(activity: ActivityView, label: string): string | undefined {
  if (label === PARTICIPATION_LABEL) return label;
  return activity.awardTiers.length > 1 ? label : undefined;
}

/**
 * One scan submission. Returns the outcome to show and never throws: an unreachable server is
 * a queued success, not a failure the facilitator has to think about.
 */
async function sendScan(input: {
  activity: ActivityView;
  /** ADR-116 — null arms the participation award rather than a configured tier. */
  tier: AwardTier | null;
  participationPoints: number;
  nickname: string;
  roundId: string;
  replaceExisting?: boolean;
}): Promise<ScanOutcome> {
  const { activity, tier } = input;
  // The optimistic value for a queued scan. A participation award is priced by the day, not
  // the station, which is why the station is told the floor when it loads.
  const offer = {
    points: tier?.points ?? input.participationPoints,
    label: tier?.label ?? PARTICIPATION_LABEL,
  };
  const attempt = newAttempt({
    nickname: input.nickname,
    roundId: input.roundId,
    tierLabel: tier?.label ?? null,
  });
  if (input.replaceExisting === true) attempt.replaceExisting = true;
  try {
    const result = await postScan(attempt);
    if (result.duplicate) {
      return {
        kind: 'duplicate',
        message: `${messages.alreadyScannedThisRound} — ${attempt.nickname}`,
      };
    }
    return {
      kind: 'awarded',
      message: scanConfirmation({
        nickname: result.scan.participantNickname,
        points: result.scan.pointsAwardedSnapshot,
        isQueued: false,
        tierLabel: shownTierLabel(activity, result.scan.tierLabelSnapshot),
      }),
      undo: { scanId: result.scan.id, expiresAt: undoWindowEnd() },
    };
  } catch (caught) {
    return refusedScan({ caught, activity, attempt, offer });
  }
}

/** The three ways a scan fails to land, in the order a facilitator can act on them. */
function refusedScan(input: {
  caught: unknown;
  activity: ActivityView;
  attempt: ScanAttempt;
  offer: { points: number; label: string };
}): ScanOutcome {
  const { caught, activity, attempt, offer } = input;
  // ADR-116 — the slot is taken. Offer the overwrite rather than swallowing the award.
  if (caught instanceof ApiError && caught.status === 409) {
    return { kind: 'held', message: `${messages.scanSlotHeld} — ${attempt.nickname}` };
  }
  if (!(caught instanceof OfflineError)) {
    return { kind: 'rejected', message: describeError(caught) };
  }
  // ADR-092 — the queued entry carries the armed tier; the server re-prices the label at drain.
  enqueueScan({ ...attempt, activityName: activity.activityName, pointValue: offer.points });
  return {
    kind: 'queued',
    message: scanConfirmation({
      nickname: attempt.nickname,
      points: offer.points,
      isQueued: true,
      tierLabel: shownTierLabel(activity, offer.label),
    }),
    undo: { clientScanUuid: attempt.clientScanUuid, expiresAt: undoWindowEnd() },
  };
}

/**
 * ADR-138 — undoing the scan just made. The two branches are not two policies: in both cases
 * the undo is applied wherever the scan actually is. Only the server branch can be refused,
 * and its refusal is shown verbatim ("too late", "not yours") because the facilitator's next
 * move — call a superadmin, or leave it — depends on which one it was.
 */
async function takeBackScan(handle: UndoHandle): Promise<ScanOutcome> {
  if (handle.scanId === undefined) {
    removeFromQueue(handle.clientScanUuid);
    return { kind: 'undone', message: messages.scanUndone };
  }
  try {
    await undoScan(handle.scanId);
    return { kind: 'undone', message: messages.scanUndone };
  } catch (caught) {
    return { kind: 'rejected', message: describeError(caught) };
  }
}

/** F26/F28–F29 — the round lifecycle buttons on S25, S29, S30, S31. */
function useRoundControls(input: { activityId: string; round: RoundView | null; reload: () => void }) {
  const { activityId, round, reload } = input;
  const open = useAction(openRound, reload);
  const advance = useAction(advanceRound, reload);
  const close = useAction(endRound, reload);
  const reopen = useAction(reactivateRound, reload);

  return {
    openFirstRound: () => void open.run(activityId),
    advanceRoundNow: () => {
      if (round) void advance.run(round.id);
    },
    endRoundNow: () => {
      if (round) void close.run(round.id);
    },
    reactivateRoundNow: () => {
      if (round) void reopen.run(round.id);
    },
    isBusy: open.isPending || advance.isPending || close.isPending || reopen.isPending,
    controlError: firstError([open.error, advance.error, close.error, reopen.error]),
  };
}

/** The scan box's state plus what it takes to send one, which is how the runner is called. */
type ScanRunnerInput = ReturnType<typeof useScanState> & {
  activity: ActivityView | null;
  round: RoundView | null;
  tier: AwardTier | null;
  participationPoints: number;
  onAwarded: () => void;
  onQueued: () => void;
};

/**
 * The one place a scan is actually sent, shared by the first attempt and by the ADR-116
 * replacement so the two can never drift in how they report themselves. The input is held in
 * a ref so the returned callback is stable: it is a dependency of two other callbacks, and a
 * new identity each render would churn both.
 */
function useScanRunner(input: ScanRunnerInput) {
  const latest = useRef(input);
  latest.current = input;
  return useCallback(async (run: { nickname: string; replaceExisting: boolean }): Promise<ScanOutcome> => {
    const { nickname } = run;
    const live = latest.current;
    live.setIsScanning(true);
    const result = await sendScan({
      activity: live.activity as ActivityView,
      tier: live.tier,
      participationPoints: live.participationPoints,
      nickname,
      roundId: (live.round as RoundView).id,
      replaceExisting: run.replaceExisting,
    });
    live.setOutcome(result);
    // A held slot keeps the name alive for the replace button; anything else clears it.
    live.setHeldFor(result.kind === 'held' ? nickname : null);
    live.setIsScanning(false);
    live.setNickname('');
    if (result.kind === 'queued') live.onQueued();
    else if (result.kind !== 'held') live.onAwarded();
    return result;
  }, []);
}

/** The scan box's own state, lifted out so the submission hook stays readable. */
function useScanState() {
  const [nickname, setNickname] = useState('');
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  /**
   * ADR-116 — the nickname whose slot is held, kept so the replace button knows who it is
   * acting on after the scan box has been cleared.
   */
  const [heldFor, setHeldFor] = useState<string | null>(null);
  return {
    nickname,
    setNickname,
    outcome,
    setOutcome,
    isScanning,
    setIsScanning,
    heldFor,
    setHeldFor,
  };
}

/** S27 — the scan box: nickname in, one outcome out, never a thrown error. */
function useScanSubmission(input: {
  activity: ActivityView | null;
  round: RoundView | null;
  participationPoints: number;
  isOnline: boolean;
  onAwarded: () => void;
  onQueued: () => void;
}) {
  const { activity, round, participationPoints, isOnline, onAwarded, onQueued } = input;
  const state = useScanState();
  const { setOutcome, heldFor } = state;
  const arming = useTierArming(activity);
  const lookup = useNumberLookup({ activity, round, isOnline, setOutcome });

  const run = useScanRunner({
    ...state,
    activity,
    round,
    tier: arming.armedTier,
    participationPoints,
    onAwarded,
    onQueued,
  });

  const submitScan = useCallback(
    async (rawNickname: string): Promise<ScanOutcome> => {
      const trimmed = rawNickname.trim();
      const blocked = rejectionFor({ activity, round, nickname: trimmed });
      if (blocked) {
        setOutcome(blocked);
        return blocked;
      }
      return run({ nickname: trimmed, replaceExisting: false });
    },
    [activity, round, run, setOutcome],
  );

  /** ADR-116 — the facilitator has seen what is there and chosen to overwrite it. */
  const replaceAward = useCallback(async (): Promise<ScanOutcome | null> => {
    if (heldFor === null) return null;
    return run({ nickname: heldFor, replaceExisting: true });
  }, [heldFor, run]);

  /**
   * ADR-138 — the handle rides on the outcome the facilitator is looking at, so the button can
   * only ever undo the scan whose confirmation is on screen. An outcome that moved no points
   * carries no handle, and there is nothing to take back.
   */
  const undoLast = useCallback(async (): Promise<ScanOutcome | null> => {
    const handle = state.outcome?.undo;
    if (!handle) return null;
    const result = await takeBackScan(handle);
    setOutcome(result);
    if (result.kind !== 'undone') return result;
    // The board and the queue badge both just changed; refresh whichever one held the scan.
    if (handle.scanId === undefined) onQueued();
    else onAwarded();
    return result;
  }, [onAwarded, onQueued, setOutcome, state.outcome]);

  return { ...state, submitScan, replaceAward, undoLast, ...arming, ...lookup };
}

/**
 * ADR-092 — the sticky armed tier. The first tier is pre-armed so the common case stays
 * zero-tap; a tap arms another tier for every scan until changed. If the superadmin edits
 * the list mid-round, an orphaned selection falls back to the first tier rather than
 * blocking the queue.
 */
function useTierArming(activity: ActivityView | null) {
  const [armedTierLabel, setArmedTierLabel] = useState<string | null>(null);

  /**
   * ADR-116 — arming PARTICIPATION_LABEL resolves to null, which is how the whole path
   * spells "took part": the station cannot price it, so it names it and lets the server
   * price it from the day's floor.
   */
  const isParticipationArmed = armedTierLabel === PARTICIPATION_LABEL;

  const armedTier = useMemo(() => {
    if (armedTierLabel === PARTICIPATION_LABEL) return null;
    const tiers = activity?.awardTiers ?? [];
    return tiers.find((tier) => tier.label === armedTierLabel) ?? tiers[0] ?? null;
  }, [activity, armedTierLabel]);

  return {
    armedTier,
    isParticipationArmed,
    armTier: useCallback((label: string) => setArmedTierLabel(label), []),
  };
}

/**
 * ADR-088 — resolve a typed scan number to a person, so the facilitator can verify a NAME
 * before any points move. Online-only by product call: a number cannot be resolved without
 * the server, and queueing an unverified award would defeat the verification the number
 * exists for — offline, the QR path (which still queues) is the way. Failures land in the
 * same outcome line as scan results: one place to glance at, whatever went wrong.
 */
function useNumberLookup(input: {
  activity: ActivityView | null;
  round: RoundView | null;
  isOnline: boolean;
  setOutcome: (outcome: ScanOutcome | null) => void;
}) {
  const { activity, round, isOnline, setOutcome } = input;
  const [number, setNumber] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  const lookupNumber = useCallback(
    async (digits: string): Promise<ParticipantView | null> => {
      const guard = lookupGuard({ activity, round, isOnline, digits });
      if (guard) {
        setOutcome({ kind: 'rejected', message: guard });
        return null;
      }
      setIsLookingUp(true);
      try {
        const { participant } = await findParticipantByNumber(digits);
        setOutcome(null);
        return participant;
      } catch (caught) {
        // The digits stay in the field: the evidence belongs next to the message about it.
        const message =
          caught instanceof OfflineError ? messages.manualEntryOffline : describeError(caught);
        setOutcome({ kind: 'rejected', message });
        return null;
      } finally {
        setIsLookingUp(false);
      }
    },
    [activity, isOnline, round, setOutcome],
  );

  return { number, setNumber, isLookingUp, lookupNumber };
}

/** The reasons a lookup must not even be attempted, in the order a facilitator would hit them. */
function lookupGuard(input: {
  activity: ActivityView | null;
  round: RoundView | null;
  isOnline: boolean;
  digits: string;
}): string | null {
  if (!input.activity || !input.round || input.round.status !== 'open') return messages.noOpenRound;
  if (!SCAN_NUMBER_PATTERN.test(input.digits)) return messages.scanNumberInvalid;
  if (!input.isOnline) return messages.manualEntryOffline;
  return null;
}

export function useFringeStation(activityId: string) {
  const sync = useSync();
  const activityState = useAsyncData(useCallback(() => fetchActivity(activityId), [activityId]));
  const activity: ActivityView | null = activityState.data?.activity ?? null;
  const round: RoundView | null = activity?.currentRound ?? null;
  const roundId = round?.id ?? null;

  const scansState = useAsyncData(
    useCallback(
      () => (roundId ? fetchRoundScans(roundId) : Promise.resolve({ items: [] as ScanView[] })),
      [roundId],
    ),
  );

  const reloadAll = useCallback(() => {
    activityState.reload();
    scansState.reload();
  }, [activityState, scansState]);

  usePolling(reloadAll);

  // ADR-116 — the day's participation floor, served alongside the activity.
  const participationPoints = activityState.data?.participationPoints ?? 0;

  const controls = useRoundControls({ activityId, round, reload: reloadAll });
  const scanning = useScanSubmission({
    activity,
    round,
    participationPoints,
    isOnline: sync.isOnline,
    onAwarded: scansState.reload,
    onQueued: sync.refresh,
  });

  const liveScans = useMemo(
    () => (scansState.data?.items ?? []).filter((scan) => !scan.isVoided),
    [scansState.data],
  );

  return {
    activity,
    round,
    participationPoints,
    scans: liveScans,
    scanCount: liveScans.length,
    isLoading: activityState.isLoading,
    isOnline: sync.isOnline,
    ...scanning,
    ...controls,
    error: firstError([activityState.error, controls.controlError]),
    reload: reloadAll,
  };
}

/** The two states in which a scan cannot even be attempted (fds.md §2.9). */
function rejectionFor(input: {
  activity: ActivityView | null;
  round: RoundView | null;
  nickname: string;
}): ScanOutcome | null {
  if (!input.activity || !input.round || input.round.status !== 'open') {
    return { kind: 'rejected', message: messages.noOpenRound };
  }
  if (!input.nickname) return { kind: 'rejected', message: messages.nicknameNotFound };
  return null;
}
