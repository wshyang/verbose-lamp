import { useCallback, useMemo, useState } from 'react';
import type { ActivityView, PointConfigView } from '@psd/contracts';
import {
  createActivity,
  fetchAdminActivities,
  fetchDashboard,
  fetchOperationsOverview,
  fetchPointConfig,
  savePointConfig,
  setActivityActive,
  updateActivity,
} from '../api/admin.js';
import { useAction } from './useAction.js';
import { firstError, usePolling, useAsyncData } from './useAsyncData.js';
import { useDraftEditor } from './useDraftEditor.js';

/** S35 dashboard, S36 point config, S37–S40 activities. ADR-270 — courts left with the old tournament. */

/**
 * ADR-151 — the operations overview, on the same jittered poll as every other live surface.
 *
 * Not a bespoke thirty-second timer. There is exactly one console and the window it reports
 * is fifteen minutes wide, so a refresh somewhere in 45–75 s is comfortably inside the
 * resolution of the question — and a second polling mechanism would be a second thing that
 * can be left running on a page nobody is looking at.
 */
export function useAdminOperations() {
  const state = useAsyncData(useCallback(() => fetchOperationsOverview(), []));
  usePolling(state.reload);
  return {
    overview: state.data?.overview ?? null,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

export function useAdminDashboard() {
  const state = useAsyncData(useCallback(() => fetchDashboard(), []));
  const status = state.data?.status ?? null;
  const blockers = useMemo(() => {
    if (!status) return [];
    const open: string[] = [];
    if (status.activeActivityCount === 0) open.push('No fringe activities are active (B6).');
    if (status.facilitatorCount === 0) open.push('No facilitator accounts exist (B7).');
    return open;
  }, [status]);

  return { status, blockers, isLoading: state.isLoading, error: state.error, reload: state.reload };
}

/**
 * S36's numeric fields, with what each falls back to when nothing is configured yet. The keys are
 * the request body's keys, so adding a field is one entry. ADR-270 — the fringe settings only; the
 * tournament's rates and pacing are set on the tournament itself.
 */
const POINT_CONFIG_DEFAULTS = {
  /** ADR-116 — the day's participation floor. */
  fringeParticipationPoints: 5,
  /** ADR-176 — the passport bonus, 0 for off, and the distinct stations that earn it. */
  fringePassportBonusPoints: 0,
  fringePassportStations: 4,
} as const;

type PointConfigDraft = Record<keyof typeof POINT_CONFIG_DEFAULTS, string>;

function pointConfigDraft(current: PointConfigView | null): PointConfigDraft {
  const entries = Object.entries(POINT_CONFIG_DEFAULTS).map(([key, fallback]) => [
    key,
    String(current?.[key as keyof typeof POINT_CONFIG_DEFAULTS] ?? fallback),
  ]);
  return Object.fromEntries(entries) as PointConfigDraft;
}

/** Blank until the superadmin opens the form — an empty box is not a proposal of zero. */
const BLANK_POINT_CONFIG = Object.fromEntries(
  Object.keys(POINT_CONFIG_DEFAULTS).map((key) => [key, '']),
) as PointConfigDraft;

/** The editable settings, each as the pair the form binds to. */
function pointFields(
  draft: PointConfigDraft,
  setField: (name: keyof PointConfigDraft) => (value: string) => void,
) {
  return {
    participationPoints: draft.fringeParticipationPoints,
    setParticipationPoints: setField('fringeParticipationPoints'),
    passportBonusPoints: draft.fringePassportBonusPoints,
    setPassportBonusPoints: setField('fringePassportBonusPoints'),
    passportStations: draft.fringePassportStations,
    setPassportStations: setField('fringePassportStations'),
  };
}

export function useAdminPointConfig() {
  const state = useAsyncData(useCallback(() => fetchPointConfig(), []));
  const [draft, setDraft] = useState<PointConfigDraft>(BLANK_POINT_CONFIG);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const reload = state.reload;
  const save = useAction(savePointConfig, (result) => {
    setSavedAt(result.pointConfig.updatedAt);
    reload();
  });

  const current = state.data?.pointConfig ?? null;

  const setField = useCallback(
    (name: keyof PointConfigDraft) => (value: string) =>
      setDraft((previous) => ({ ...previous, [name]: value })),
    [],
  );

  const submit = useCallback(async () => {
    await save.run({
      fringeParticipationPoints: Number(draft.fringeParticipationPoints),
      fringePassportBonusPoints: Number(draft.fringePassportBonusPoints),
      fringePassportStations: Number(draft.fringePassportStations),
    });
  }, [save, draft]);

  const startEditing = useCallback(() => setDraft(pointConfigDraft(current)), [current]);

  return {
    current,
    ...pointFields(draft, setField),
    startEditing,
    submit,
    savedAt,
    isSaving: save.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, save.error]),
  };
}

export interface TierDraft {
  label: string;
  points: string;
}

export interface ActivityDraft {
  activityName: string;
  tiers: TierDraft[];
  assignedFacilitatorId: string;
  isActive: boolean;
}

export const EMPTY_ACTIVITY_DRAFT: ActivityDraft = {
  activityName: '',
  tiers: [{ label: 'Award', points: '10' }],
  assignedFacilitatorId: '',
  isActive: true,
};

function activityBody(draft: ActivityDraft) {
  return {
    activityName: draft.activityName.trim(),
    awardTiers: draft.tiers.map((tier) => ({ label: tier.label.trim(), points: Number(tier.points) })),
    assignedFacilitatorId: draft.assignedFacilitatorId || undefined,
  };
}

function draftFromActivity(activity: ActivityView): ActivityDraft {
  return {
    activityName: activity.activityName,
    tiers: activity.awardTiers.map((tier) => ({ label: tier.label, points: String(tier.points) })),
    assignedFacilitatorId: activity.assignedFacilitatorId ?? '',
    isActive: activity.isActive,
  };
}

export function useAdminActivities() {
  const state = useAsyncData(useCallback(() => fetchAdminActivities(), []));
  const activities = useMemo(() => state.data?.items ?? [], [state.data]);
  const reload = state.reload;
  const editor = useDraftEditor(EMPTY_ACTIVITY_DRAFT, reload);
  const { draft, editingId } = editor;

  const create = useAction(createActivity, editor.reset);
  const update = useAction(updateActivity, editor.reset);
  const toggle = useAction(setActivityActive, reload);

  const submitDraft = useCallback(async () => {
    if (!editingId) {
      await create.run(activityBody(draft));
      return;
    }
    await update.run({
      activityId: editingId,
      body: { ...activityBody(draft), isActive: draft.isActive },
    });
  }, [create, draft, editingId, update]);

  const beginEdit = (activityId: string) => {
    const existing = activities.find((activity) => activity.id === activityId);
    if (existing) editor.beginEdit(activityId, draftFromActivity(existing));
  };

  return {
    activities,
    ...editor,
    beginEdit,
    submitDraft,
    setActive: (input: { activityId: string; isEnabled: boolean }) => void toggle.run(input),
    isBusy: create.isPending || update.isPending || toggle.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, update.error, toggle.error]),
    reload,
  };
}
