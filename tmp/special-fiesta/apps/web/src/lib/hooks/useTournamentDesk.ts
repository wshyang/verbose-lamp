import { useCallback, useMemo, useState } from 'react';
import type { AdminMatchView, AdminTournamentConsoleView, AdminTournamentView } from '@psd/contracts';
import * as desk from '../api/tournament.js';
import { describeError, useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-279 — the Control subtab's state: the one read, and every desk action against it.
 *
 * Every write answers with the whole Control read (the API's rule), so an action does not patch what
 * the hook holds — it replaces it with the answer. One error slot, one in-flight flag: the desk does
 * one thing at a time, and a second click while the first is in flight is a double-submit.
 */

type Console = AdminTournamentConsoleView;

/** The groups the matches table shows, in the order the desk works through a day. */
export interface MatchGroups {
  live: AdminMatchView[];
  queued: AdminMatchView[];
  finished: AdminMatchView[];
}

/** Planned start first (an unplaced match last), then the structure's own order. */
function byPlan(left: AdminMatchView, right: AdminMatchView): number {
  const at = (match: AdminMatchView) => (match.plannedStartAt === null ? Number.POSITIVE_INFINITY : Date.parse(match.plannedStartAt));
  return at(left) - at(right) || left.sequence - right.sequence;
}

/** Every finished match has an end; latest first. */
function byLatestEnd(left: AdminMatchView, right: AdminMatchView): number {
  return Date.parse(right.endedAt ?? '') - Date.parse(left.endedAt ?? '');
}

/** Byes are results, not matches: they are on the table, never on the list. */
export function groupMatches(tournament: AdminTournamentView | null): MatchGroups {
  const matches = (tournament?.matches ?? []).filter((match) => match.resultKind !== 'bye');
  return {
    live: matches.filter((match) => match.status === 'in_progress'),
    queued: matches.filter((match) => match.status === 'scheduled').sort(byPlan),
    finished: matches.filter((match) => match.status === 'completed' || match.status === 'cancelled').sort(byLatestEnd),
  };
}

/** What the desk is looking at: no tournament, a draft being set up, a live day, or a closed one. */
export type DeskPhase = 'none' | 'draft' | 'live' | 'closed';

export function phaseOf(tournament: AdminTournamentView | null): DeskPhase {
  return tournament === null ? 'none' : tournament.status;
}

export function useTournamentDesk() {
  const [fresh, setFresh] = useState<Console | null>(null);
  // A poll's answer is newer than any write before it, so it takes over from the write's answer.
  const load = useCallback(async () => {
    const read = await desk.fetchConsole();
    setFresh(null);
    return read;
  }, []);
  const state = useAsyncData(load);
  usePolling(state.reload);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  /** Runs one desk write; its answer becomes what the console shows. Resolves to whether it worked. */
  const perform = useCallback(async (write: () => Promise<Console>): Promise<boolean> => {
    setIsPending(true);
    setError(null);
    try {
      setFresh(await write());
      return true;
    } catch (caught) {
      setError(describeError(caught));
      return false;
    } finally {
      setIsPending(false);
    }
  }, []);

  // A write's answer stands until the next read replaces it.
  const view = fresh ?? state.data;
  const tournament = view?.tournament ?? null;
  const groups = useMemo(() => groupMatches(tournament), [tournament]);
  return {
    tournament,
    phase: phaseOf(tournament),
    courts: view?.courts ?? [],
    teams: view?.teams ?? [],
    // ADR-336 — the room's mode, the switch that got it there, and the buttons a switch would start
    // with. Read from the one console read, so no screen infers the mode from a paused badge.
    mode: view?.mode ?? 'fixtures',
    modeSwitch: view?.modeSwitch ?? null,
    // ADR-336 §5.4 — the facilitator's ask waiting on the desk, if there is one.
    modeRequest: view?.modeRequest ?? null,
    suggestedTiers: view?.suggestedTiers ?? [],
    groups,
    isLoading: state.isLoading,
    loadError: state.error,
    error,
    isPending,
    perform,
    clearError: () => setError(null),
  };
}

export type TournamentDesk = ReturnType<typeof useTournamentDesk>;
