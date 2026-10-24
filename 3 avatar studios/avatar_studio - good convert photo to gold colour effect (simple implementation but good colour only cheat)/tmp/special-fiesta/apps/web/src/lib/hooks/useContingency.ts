import { useCallback, useEffect, useState } from 'react';
import type { AdminCourtView, AdminSchedulerView, ContingencyPreviewView } from '@psd/contracts';
import * as desk from '../api/tournament.js';
import { describeError } from './useAsyncData.js';
import type { TournamentDesk } from './useTournamentDesk.js';

/**
 * ADR-279 — requirement 8 at the desk: which courts are on, and the match and changeover lengths,
 * edited as a draft; Preview asks the planner what the change would move (and writes nothing); Apply
 * makes it. The draft starts from the day as it stands and is re-read whenever that changes.
 */

export interface ContingencyDraft {
  enabledCourtIds: string[];
  matchMinutes: string;
  changeoverMinutes: string;
  /** ADR-329 F13 — one length per stage with unplayed matches, keyed by stage id. */
  stageMinutes: Record<string, string>;
  restMinutes: string;
  /** ISO hard stop; empty keeps the scheduler's, the word `none` clears it. */
  deadlineAt: string;
}

export function draftFrom(
  courts: readonly AdminCourtView[],
  scheduler: AdminSchedulerView | null,
  stageTimings: readonly { id: string; matchMinutes: number }[] = [],
): ContingencyDraft {
  return {
    enabledCourtIds: courts.filter((court) => court.isEnabled).map((court) => court.id),
    matchMinutes: String(scheduler?.matchMinutes ?? 12),
    changeoverMinutes: String(scheduler?.changeoverMinutes ?? 3),
    stageMinutes: Object.fromEntries(stageTimings.map((stage) => [stage.id, String(stage.matchMinutes)])),
    restMinutes: String(scheduler?.restMinutes ?? 0),
    deadlineAt: scheduler?.deadlineAt ?? '',
  };
}

function bodyOf(draft: ContingencyDraft): desk.ContingencyBody {
  return {
    enabledCourtIds: draft.enabledCourtIds,
    matchMinutes: Number(draft.matchMinutes),
    changeoverMinutes: Number(draft.changeoverMinutes),
    stageMinutes: Object.entries(draft.stageMinutes).map(([stageId, minutes]) => ({ stageId, matchMinutes: Number(minutes) })),
    restMinutes: Number(draft.restMinutes),
    deadlineAt: draft.deadlineAt === '' ? undefined : draft.deadlineAt === 'none' ? null : draft.deadlineAt,
  };
}

export interface ContingencyInput {
  desk: TournamentDesk;
  courts: readonly AdminCourtView[];
  scheduler: AdminSchedulerView | null;
  stageTimings: readonly { id: string; label: string; matchMinutes: number }[];
}

export function useContingency(input: ContingencyInput) {
  const { perform } = input.desk;
  const { courts, scheduler, stageTimings } = input;
  const [draft, setDraft] = useState<ContingencyDraft>(() => draftFrom(courts, scheduler, stageTimings));
  const [preview, setPreview] = useState<ContingencyPreviewView | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // The day moved (a write, a poll): start the draft again from what is true now.
  // Keyed on the stages' ids and lengths, not the array the page builds each render.
  const stageKey = stageTimings.map((stage) => `${stage.id}:${stage.matchMinutes}`).join(',');
  useEffect(() => {
    setDraft(draftFrom(courts, scheduler, stageTimings));
    setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stageKey carries the stage timings
  }, [courts, scheduler, stageKey]);

  const toggleCourt = useCallback((courtId: string) => {
    setPreview(null);
    setDraft((current) => {
      const isOn = current.enabledCourtIds.includes(courtId);
      const enabledCourtIds = isOn ? current.enabledCourtIds.filter((id) => id !== courtId) : [...current.enabledCourtIds, courtId];
      return { ...current, enabledCourtIds };
    });
  }, []);

  const update = useCallback((patch: Partial<ContingencyDraft>) => {
    setPreview(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const runPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      setPreview(await desk.previewContingency(bodyOf(draft)));
    } catch (caught) {
      setPreviewError(describeError(caught));
    }
  }, [draft]);

  const apply = useCallback(() => perform(() => desk.applyContingency(bodyOf(draft))), [draft, perform]);
  return { draft, toggleCourt, update, preview, previewError, runPreview, apply };
}

export type Contingency = ReturnType<typeof useContingency>;
