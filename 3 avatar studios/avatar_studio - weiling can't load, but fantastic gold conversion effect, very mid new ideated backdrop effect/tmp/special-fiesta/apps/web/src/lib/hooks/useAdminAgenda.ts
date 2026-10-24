import { useCallback, useMemo } from 'react';
import type { AgendaItemRequest, AgendaItemView } from '@psd/contracts';
import {
  createAgendaItem,
  fetchAdminAgenda,
  moveAgendaItem,
  setAgendaItemActive,
  updateAgendaItem,
} from '../api/admin.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData } from './useAsyncData.js';
import { useDraftEditor } from './useDraftEditor.js';

/**
 * ADR-177 — the superadmin's run-sheet editor.
 *
 * ADR-186 — times are a full local date AND time, not a bare clock reading.
 *
 * This hook used to hold `HH:MM` strings from an `<input type="time">` and graft them onto a day
 * it INFERRED: the earliest item already on the programme, falling back to `new Date()`. That
 * fallback is why saved times appeared not to stick. On an empty programme the first item was
 * dated today; edit it tomorrow and the clock reading was re-grafted onto tomorrow, so the whole
 * run sheet silently walked forward with the calendar. Nothing was ever wrong on screen, which is
 * what made it so hard to see — the time looked right, the DATE underneath it had moved.
 *
 * The day is now an input like any other, so there is nothing left to infer and nothing to drift.
 * The cost is that whoever types the programme picks a date per item rather than once; that is
 * the correct trade, because the thing being removed was a guess about which day the user meant.
 */

export interface AgendaDraft {
  /** `YYYY-MM-DDTHH:MM` local, as `<input type="datetime-local">` produces; empty = untimed. */
  startAt: string;
  endAt: string;
  title: string;
  location: string;
  detail: string;
}

export const EMPTY_AGENDA_DRAFT: AgendaDraft = {
  startAt: '',
  endAt: '',
  title: '',
  location: '',
  detail: '',
};

/**
 * A `datetime-local` value is a wall-clock reading with no offset, so `new Date(value)` reads it
 * in the browser's own zone — which is the zone the person typing it is standing in. That is the
 * whole conversion: no day to look up, no `setHours` onto a borrowed date.
 */
function instantFrom(local: string): string | null {
  if (!local) return null;
  const when = new Date(local);
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The inverse, back into the `YYYY-MM-DDTHH:MM` the input expects, in local time. */
function localFrom(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  const date = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  return `${date}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

function draftFromItem(item: AgendaItemView): AgendaDraft {
  return {
    startAt: localFrom(item.startsAt),
    endAt: localFrom(item.endsAt),
    title: item.title,
    location: item.location ?? '',
    detail: item.detail ?? '',
  };
}

function bodyFrom(draft: AgendaDraft): AgendaItemRequest {
  return {
    startsAt: instantFrom(draft.startAt),
    endsAt: instantFrom(draft.endAt),
    title: draft.title.trim(),
    location: draft.location.trim() || null,
    detail: draft.detail.trim() || null,
  };
}

export function useAdminAgenda() {
  const state = useAsyncData(useCallback(() => fetchAdminAgenda(), []));
  const items = useMemo(() => state.data?.items ?? [], [state.data]);
  const reload = state.reload;
  const editor = useDraftEditor(EMPTY_AGENDA_DRAFT, reload);
  const { draft, editingId } = editor;

  const create = useAction(createAgendaItem, editor.reset);
  const update = useAction(updateAgendaItem, editor.reset);
  const toggle = useAction(setAgendaItemActive, reload);
  const move = useAction(moveAgendaItem, reload);

  const submitDraft = useCallback(async () => {
    const body = bodyFrom(draft);
    if (!editingId) {
      await create.run(body);
      return;
    }
    await update.run({ itemId: editingId, body });
  }, [create, draft, editingId, update]);

  const beginEdit = (itemId: string) => {
    const existing = items.find((item) => item.id === itemId);
    if (existing) editor.beginEdit(itemId, draftFromItem(existing));
  };

  return {
    items,
    ...editor,
    beginEdit,
    submitDraft,
    setActive: (input: { itemId: string; isEnabled: boolean }) => void toggle.run(input),
    move: (input: { itemId: string; direction: 'up' | 'down' }) => void move.run(input),
    isBusy: create.isPending || update.isPending || toggle.isPending || move.isPending,
    isLoading: state.isLoading,
    error: firstError([state.error, create.error, update.error, toggle.error, move.error]),
    reload,
  };
}
