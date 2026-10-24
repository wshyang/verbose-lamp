import { useCallback, useMemo, useState } from 'react';
import type { ActivityView, AdminCourtView, FacilitatorView, StationType } from '@psd/contracts';
import {
  createFacilitator,
  createSuperadmin,
  fetchAdminActivities,
  fetchFacilitators,
  fetchSuperadmins,
  updateFacilitator,
  updateSuperadminPasscode,
} from '../api/admin.js';
import { fetchConsole } from '../api/tournament.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';
import { useDraftEditor } from './useDraftEditor.js';

/** S44–S46 facilitator accounts, S57–S59 superadmin accounts. */

export interface FacilitatorDraft {
  username: string;
  passcode: string;
  displayLabel: string;
  defaultStationType: StationType;
  defaultStationId: string;
}

export const EMPTY_FACILITATOR_DRAFT: FacilitatorDraft = {
  username: '',
  passcode: '',
  displayLabel: '',
  defaultStationType: 'none',
  defaultStationId: '',
};

export interface StationChoice {
  id: string;
  label: string;
  type: StationType;
}

const NO_ACTIVITIES: ActivityView[] = [];

const NO_COURTS: AdminCourtView[] = [];

/**
 * S45 default-station picker: the options depend on the station type chosen in the draft.
 * ADR-285 — a court station names one of the venue's courts again, read off the tournament console.
 */
function useStationChoices(stationType: StationType): StationChoice[] {
  const activities = useAsyncData(useCallback(() => fetchAdminActivities(), []));
  const venue = useAsyncData(useCallback(() => fetchConsole(), []));
  const activityItems = activities.data?.items ?? NO_ACTIVITIES;
  const courts = venue.data?.courts ?? NO_COURTS;

  return useMemo(() => {
    if (stationType === 'fringe_activity') {
      return activityItems.map((activity) => ({ id: activity.id, label: activity.activityName, type: 'fringe_activity' as StationType }));
    }
    if (stationType === 'court') return courts.map((court) => ({ id: court.id, label: court.label, type: 'court' as StationType }));
    return [];
  }, [activityItems, courts, stationType]);
}

/** A new account carries a passcode; an edit leaves it blank to keep the current one (F39–F40). */
function facilitatorBody(draft: FacilitatorDraft) {
  return {
    displayLabel: draft.displayLabel.trim(),
    defaultStationType: draft.defaultStationType,
    defaultStationId: draft.defaultStationType === 'none' ? null : draft.defaultStationId || null,
  };
}

function draftFromFacilitator(existing: FacilitatorView): FacilitatorDraft {
  return {
    username: existing.username,
    passcode: '',
    displayLabel: existing.displayLabel ?? '',
    defaultStationType: existing.defaultStationType,
    defaultStationId: existing.defaultStationId ?? '',
  };
}

export function useAdminFacilitators() {
  const state = useAsyncData(useCallback(() => fetchFacilitators(), []));
  const facilitators = useMemo(() => state.data?.items ?? [], [state.data]);
  const reload = state.reload;
  const editor = useDraftEditor(EMPTY_FACILITATOR_DRAFT, reload);
  const { draft, editingId } = editor;
  const stationChoices = useStationChoices(draft.defaultStationType);

  const create = useAction(createFacilitator, editor.reset);
  const update = useAction(updateFacilitator, editor.reset);

  const submitDraft = useCallback(async () => {
    const body = facilitatorBody(draft);
    if (!editingId) {
      await create.run({
        ...body,
        username: draft.username.trim(),
        passcode: draft.passcode,
        displayLabel: body.displayLabel || undefined,
      });
      return;
    }
    await update.run({
      facilitatorId: editingId,
      body: {
        ...body,
        displayLabel: body.displayLabel || null,
        passcode: draft.passcode || undefined,
      },
    });
  }, [create, draft, editingId, update]);

  const beginEdit = (facilitatorId: string) => {
    const existing = facilitators.find((item) => item.id === facilitatorId);
    if (existing) editor.beginEdit(facilitatorId, draftFromFacilitator(existing));
  };

  return {
    facilitators,
    ...editor,
    beginEdit,
    submitDraft,
    stationChoices,
    isBusy: create.isPending || update.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, update.error]),
    reload,
  };
}

export function useAdminSuperadmins() {
  const state = useAsyncData(useCallback(() => fetchSuperadmins(), []));
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotatePasscode, setRotatePasscode] = useState('');

  const reload = state.reload;
  const create = useAction(createSuperadmin, () => {
    setUsername('');
    setPasscode('');
    reload();
  });
  const rotate = useAction(updateSuperadminPasscode, () => {
    setRotatingId(null);
    setRotatePasscode('');
    reload();
  });

  return {
    superadmins: state.data?.items ?? [],
    username,
    setUsername,
    passcode,
    setPasscode,
    submitCreate: () => void create.run({ username: username.trim(), passcode }),
    rotatingId,
    setRotatingId,
    rotatePasscode,
    setRotatePasscode,
    submitRotate: () => {
      if (rotatingId) void rotate.run({ superadminId: rotatingId, passcode: rotatePasscode });
    },
    isBusy: create.isPending || rotate.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, rotate.error]),
    reload,
  };
}
