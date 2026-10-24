import { useCallback, useState } from 'react';
import type { AdminCourtView } from '@psd/contracts';
import * as desk from '../api/tournament.js';
import type { TournamentDesk } from './useTournamentDesk.js';

/**
 * ADR-288 — the venue's courts at the desk (fds S41–S43): one form that adds a court, or edits the one
 * picked, and a switch per court. A court exists before any tournament and outlives every one, so the
 * panel is there in every phase; switching a court off is soft (§3.4) — a match on it plays on.
 */

export interface CourtDraft {
  courtNumber: string;
  label: string;
}

const EMPTY: CourtDraft = { courtNumber: '', label: '' };

export function courtBodyOf(draft: CourtDraft): desk.CourtBody {
  return { courtNumber: Number(draft.courtNumber), label: draft.label.trim() };
}

export function useTournamentCourts(input: TournamentDesk) {
  const { perform } = input;
  const [draft, setDraft] = useState<CourtDraft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const update = useCallback((patch: Partial<CourtDraft>) => setDraft((current) => ({ ...current, ...patch })), []);

  const beginEdit = useCallback((court: AdminCourtView) => {
    setEditingId(court.id);
    setDraft({ courtNumber: String(court.courtNumber), label: court.label });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraft(EMPTY);
  }, []);

  /** The form is cleared only once the desk has the court: a refused one stays to be fixed. */
  const submit = useCallback(async () => {
    const body = courtBodyOf(draft);
    const ok = await perform(() => (editingId === null ? desk.createCourt(body) : desk.updateCourt({ ...body, courtId: editingId })));
    if (ok) cancelEdit();
    return ok;
  }, [cancelEdit, draft, editingId, perform]);

  const toggle = useCallback((court: AdminCourtView) => perform(() => desk.setCourtEnabled({ courtId: court.id, isEnabled: !court.isEnabled })), [perform]);

  return { draft, update, editingId, beginEdit, cancelEdit, submit, toggle };
}

export type TournamentCourts = ReturnType<typeof useTournamentCourts>;
