import { useCallback } from 'react';
import type { FixtureView } from '@psd/contracts';
import { fetchCourtLineups } from '../api/tournament.js';
import { fetchCourts } from '../api/stations.js';
import { useAsyncData, usePolling } from './useAsyncData.js';

/**
 * ADR-284 — the court console's Line-ups subtab: what is planned on this court, in play order, so the
 * marshal can call the next pair over before the court is free. Read-only, polled like the console.
 */

/** A seat as the marshal reads it: the team, or where it will come from ("Winner of #7"). */
export function seatName(fixture: FixtureView, side: 'a' | 'b'): string {
  const name = side === 'a' ? fixture.teamAName : fixture.teamBName;
  const from = side === 'a' ? fixture.teamAFromSequence : fixture.teamBFromSequence;
  if (name !== null) return name;
  const outcome = fixture.stage === 'third_place' ? 'Loser' : 'Winner';
  return from === null || from === undefined ? 'To be decided' : `${outcome} of #${from}`;
}

export function useCourtLineups(courtId: string) {
  const lineups = useAsyncData(useCallback(() => fetchCourtLineups(courtId), [courtId]));
  const courts = useAsyncData(useCallback(() => fetchCourts(), []));
  usePolling(lineups.reload);
  const court = (courts.data?.items ?? []).find((row) => row.id === courtId) ?? null;
  return {
    title: court === null ? 'Court' : court.displayLabel,
    items: lineups.data?.items ?? [],
    isLoading: lineups.isLoading,
    error: lineups.error,
  };
}
