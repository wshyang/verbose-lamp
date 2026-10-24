import { useCallback, useState } from 'react';
import type { DumbCourtView } from '@psd/contracts';
import { awardDumbPoints, fetchDumbCourt, voidDumbAward } from '../api/stations.js';
import { newClientScanUuid } from '../offline/scanQueue.js';
import { describeError, useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-321 — the dumb court console's state. One read, polled: the court's tiers, the teams in
 * the tournament, and this court's award log. Awarding is arm-a-tier, tap-a-team, confirm —
 * the client uuid is minted when the confirm opens, so a double-tap or a retried request
 * replays the one award instead of paying twice. There is no offline queue on purpose: an
 * award the server has not acknowledged has not happened, and the court master is standing
 * in front of the team when it does.
 */
interface DumbActions {
  award: (teamId: string, clientAwardUuid: string) => Promise<void>;
  undo: (awardId: string) => Promise<void>;
  outcome: string | null;
  isBusy: boolean;
}

function useDumbActions(input: { courtId: string; view: DumbCourtView | null; activeTier: { label: string; points: number } | null; reload: () => void }): DumbActions {
  const { courtId, view, activeTier, reload } = input;
  const [outcome, setOutcome] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const award = useCallback(
    async (teamId: string, clientAwardUuid: string) => {
      if (view === null || activeTier === null) return;
      setIsBusy(true);
      setOutcome(null);
      try {
        const next = await awardDumbPoints({ courtId, teamId, tierLabel: activeTier.label, clientAwardUuid });
        reload();
        const team = next.teams.find((candidate) => candidate.teamId === teamId);
        setOutcome(`${team?.teamName ?? 'Team'} is awarded ${activeTier.points} points!`);
      } catch (error) {
        setOutcome(describeError(error));
      } finally {
        setIsBusy(false);
      }
    },
    [activeTier, courtId, reload, view],
  );
  const undo = useCallback(
    async (awardId: string) => {
      setIsBusy(true);
      setOutcome(null);
      try {
        await voidDumbAward(awardId);
        reload();
        setOutcome('Award taken back.');
      } catch (error) {
        setOutcome(describeError(error));
      } finally {
        setIsBusy(false);
      }
    },
    [reload],
  );
  return { award, undo, outcome, isBusy };
}

export function useDumbCourt(courtId: string) {
  const state = useAsyncData(useCallback(() => fetchDumbCourt(courtId), [courtId]));
  usePolling(state.reload);
  const [armedTier, setArmedTier] = useState<string | null>(null);
  const view: DumbCourtView | null = state.data ?? null;
  const tiers = view?.tiers ?? [];
  const activeTier = tiers.find((tier) => tier.label === armedTier) ?? tiers[0] ?? null;
  const actions = useDumbActions({ courtId, view, activeTier, reload: state.reload });
  return {
    view,
    tiers,
    activeTier,
    armTier: setArmedTier,
    award: actions.award,
    undo: actions.undo,
    outcome: actions.outcome,
    isBusy: actions.isBusy,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
    /** A fresh idempotency key for one award intent. */
    mintAwardUuid: newClientScanUuid,
  };
}
