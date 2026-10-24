import { useCallback, useState } from 'react';
import type { AdminMatchView } from '@psd/contracts';
import * as desk from '../api/tournament.js';
import type { TournamentDesk } from './useTournamentDesk.js';
import { deadlineOf } from './useTournamentSetup.js';

/**
 * ADR-289 — requirement 9 at the desk: put a queued match on a court at a time. With the scheduler
 * running the move is pinned (the planner plans around it until Release hands it back); once the
 * scheduler is stopped, the move is simply where the match now is. Not a correction — nothing that
 * happened is changed — so it asks for no reason (fds.md §2.13 is about results).
 */

export interface PlacementDraft {
  courtId: string;
  /** Local `HH:MM`, today. */
  time: string;
}

const EMPTY: PlacementDraft = { courtId: '', time: '' };

/** An instant as the local `HH:MM` a time field shows, or '' for none. */
export function clockOfInstant(at: string | null): string {
  if (at === null) return '';
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function problemOf(draft: PlacementDraft, startAt: string | null): string | null {
  if (draft.courtId === '') return 'Pick a court.';
  return startAt === null ? 'Pick a start time.' : null;
}

/** The match a move is open on, while it is still queued (a poll may have started it meanwhile). */
export function movingMatchOf(matches: readonly AdminMatchView[], matchId: string | null): AdminMatchView | null {
  return matches.find((match) => match.id === matchId && match.status === 'scheduled') ?? null;
}

export function useMatchPlacement(input: TournamentDesk) {
  const { perform, clearError } = input;
  const [matchId, setMatchId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlacementDraft>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const update = useCallback((patch: Partial<PlacementDraft>) => setDraft((current) => ({ ...current, ...patch })), []);

  const open = useCallback(
    (match: AdminMatchView) => {
      clearError();
      setProblem(null);
      setMatchId(match.id);
      setDraft({ courtId: match.courtId ?? '', time: clockOfInstant(match.plannedStartAt) });
    },
    [clearError],
  );

  const cancel = useCallback(() => setMatchId(null), []);

  /** The time is read on today: the desk moves matches within the day it is running. */
  const confirm = useCallback(
    async () => {
      if (matchId === null) return;
      const startAt = deadlineOf(draft.time, new Date());
      const refusal = problemOf(draft, startAt);
      setProblem(refusal);
      if (refusal !== null || startAt === null) return;
      if (await perform(() => desk.moveMatch({ matchId, courtId: draft.courtId, startAt }))) setMatchId(null);
    },
    [draft, matchId, perform],
  );

  const release = useCallback((match: AdminMatchView) => perform(() => desk.releaseMatchPin(match.id)), [perform]);
  const moving = movingMatchOf(input.tournament?.matches ?? [], matchId);

  return { matchId, moving, draft, update, problem, open, cancel, confirm, release };
}

export type MatchPlacement = ReturnType<typeof useMatchPlacement>;
