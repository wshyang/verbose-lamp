import { useCallback, useMemo, useState } from 'react';
import { SCAN_UNDO_WINDOW_SECONDS } from '@psd/contracts';
import type { SwagItemView, SwagStationView } from '@psd/contracts';
import {
  advanceSwagRound,
  endSwagRound,
  fetchSwagClaims,
  fetchSwagStation,
  openSwagRound,
  postSwagClaim,
  undoSwagClaim,
} from '../api/swag.js';
import { findParticipantByNumber } from '../api/stations.js';
import { playDing } from '../audio/ding.js';
// ADR-009's minter re-worn: a claim uuid is the same client-side idempotency key a scan's is.
import { newClientScanUuid } from '../offline/scanQueue.js';
import { useAction } from './useAction.js';
import { describeError, firstError, useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-110 — the swag counter console: the fringe station hook's lean twin. Sticky item
 * arming (ADR-092's rule: one tap arms an item for every following handout), the same
 * two identify paths (camera nickname, typed number), a ding on every server-acknowledged
 * claim — and allowance refusals surface as the outcome line, never a silent nothing.
 */

export interface SwagOutcome {
  kind: 'claimed' | 'duplicate' | 'refused' | 'undone';
  text: string;
  /**
   * ADR-159 — present only on a handout this counter just made and may still take back.
   * `expiresAt` drives the countdown and nothing else: the server owns the window and
   * re-checks it, so a tap on the last tick can still come back refused, in words.
   *
   * Simpler than the fringe twin's handle on purpose. A scan can be sitting in the offline
   * queue, so undoing it means deciding where it actually is; a claim is only ever recorded
   * by the server, because a handout the server has not acknowledged has not consumed any
   * allowance and there is nothing to take back.
   */
  undo?: { claimId: string; expiresAt: number };
}

/** The console's two reads, polled together; claims only exist while a round is open. */
function useSwagReads(stationId: string) {
  const stationState = useAsyncData(useCallback(() => fetchSwagStation(stationId), [stationId]));
  const station: SwagStationView | null = stationState.data?.station ?? null;
  const round = station?.currentRound ?? null;
  const roundId = round?.status === 'open' ? round.id : null;
  const claimsState = useAsyncData(
    useCallback(
      () => (roundId === null ? Promise.resolve(null) : fetchSwagClaims(roundId)),
      [roundId],
    ),
  );
  const reloadAll = useCallback(() => {
    stationState.reload();
    claimsState.reload();
  }, [claimsState, stationState]);
  usePolling(reloadAll);
  return { stationState, station, round, roundId, claimsState, reloadAll };
}

/** One handout attempt, start to outcome line. */
function useClaiming(input: {
  roundId: string | null;
  armedItem: SwagItemView | null;
  reloadAll: () => void;
}) {
  const { roundId, armedItem, reloadAll } = input;
  const [outcome, setOutcome] = useState<SwagOutcome | null>(null);
  const claimFor = useCallback(
    async (nickname: string) => {
      if (roundId === null || armedItem === null) return;
      setOutcome(null);
      try {
        const result = await postSwagClaim({
          nickname,
          roundId,
          itemLabel: armedItem.label,
          clientClaimUuid: newClientScanUuid(),
        });
        if (result.duplicate) {
          setOutcome({ kind: 'duplicate', text: `Already recorded — ${nickname} has that one.` });
        } else {
          playDing();
          setOutcome({
            kind: 'claimed',
            text: `${armedItem.label} → ${nickname}`,
            undo: {
              claimId: result.claim.id,
              expiresAt: Date.now() + SCAN_UNDO_WINDOW_SECONDS * 1000,
            },
          });
        }
        reloadAll();
      } catch (caught) {
        setOutcome({ kind: 'refused', text: describeError(caught) });
      }
    },
    [armedItem, reloadAll, roundId],
  );
  return { outcome, claimFor, undoLast: useUndoLast({ outcome, setOutcome, reloadAll }) };
}

/**
 * ADR-159 — taking back the handout whose confirmation is still on screen, and only that
 * one. The outcome is replaced by the next claim, so the button cannot be aimed at anything
 * the counter has stopped looking at.
 */
function useUndoLast(input: {
  outcome: SwagOutcome | null;
  setOutcome: (next: SwagOutcome) => void;
  reloadAll: () => void;
}) {
  const { outcome, setOutcome, reloadAll } = input;
  return useCallback(async () => {
    const handle = outcome?.undo;
    if (!handle) return;
    try {
      await undoSwagClaim(handle.claimId);
      setOutcome({ kind: 'undone', text: 'Taken back — their allowance is free again.' });
      reloadAll();
    } catch (caught) {
      setOutcome({ kind: 'refused', text: describeError(caught) });
    }
  }, [outcome, reloadAll, setOutcome]);
}

export function useSwagStation(stationId: string) {
  const reads = useSwagReads(stationId);
  const { station, round, roundId, reloadAll } = reads;

  const [armedLabel, setArmedLabel] = useState<string | null>(null);
  const items = useMemo(() => station?.items ?? [], [station]);
  const armedItem: SwagItemView | null =
    items.find((item) => item.label === armedLabel) ?? items[0] ?? null;

  const [number, setNumber] = useState('');
  const claiming = useClaiming({ roundId, armedItem, reloadAll });

  const open = useAction(openSwagRound, reloadAll);
  const advance = useAction(advanceSwagRound, reloadAll);
  const end = useAction(endSwagRound, reloadAll);
  const lookup = useAction(findParticipantByNumber, () => undefined);

  return {
    station,
    round,
    claims: reads.claimsState.data?.items ?? [],
    items,
    armedItem,
    armItem: setArmedLabel,
    number,
    setNumber,
    outcome: claiming.outcome,
    claimFor: claiming.claimFor,
    undoLast: claiming.undoLast,
    lookupNumber: (digits: string) => lookup.run(digits),
    openRound: () => void open.run(stationId),
    advanceRound: () => {
      if (round) void advance.run(round.id);
    },
    endRound: () => {
      if (round) void end.run(round.id);
    },
    isBusy: open.isPending || advance.isPending || end.isPending || lookup.isPending,
    isLoading: reads.stationState.isLoading,
    error: firstError([reads.stationState.error, open.error, advance.error, end.error, lookup.error]),
  };
}
