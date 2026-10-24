import { useCallback, useEffect, useMemo, useState } from 'react';
import { readMatchOutcome } from '@psd/contracts';
import type { FixtureView, MatchView } from '@psd/contracts';
import { fetchTeams } from '../api/teams.js';
import {
  cancelMatch,
  completeMatch,
  setMatchScore,
  fetchCourts,
  fetchCurrentMatch,
  fetchRecentCourtTeams,
  fetchSchedule,
  startMatch,
} from '../api/stations.js';
import type { CourtSchedule } from '../api/stations.js';
import { useAction } from './useAction.js';
import { firstError, useAsyncData, usePolling } from './useAsyncData.js';

/** S21–S24 — the court console: pick two teams, start, declare a winner, or cancel. */

export function useCourtList() {
  const state = useAsyncData(useCallback(() => fetchCourts(), []));
  usePolling(state.reload);
  const courts = useMemo(() => state.data?.items ?? [], [state.data]);
  const enabledCourts = useMemo(() => courts.filter((court) => court.isEnabled), [courts]);
  return {
    courts,
    enabledCourts,
    isLoading: state.isLoading,
    error: state.error,
    reload: state.reload,
  };
}

/** The console's four reads, polled together. */
function useCourtConsoleData(courtId: string) {
  const courtsState = useAsyncData(useCallback(() => fetchCourts(), []));
  const matchState = useAsyncData(useCallback(() => fetchCurrentMatch(courtId), [courtId]));
  const teamsState = useAsyncData(useCallback(() => fetchTeams(), []));
  const scheduleState = useAsyncData(useCallback(() => fetchSchedule(courtId), [courtId]));
  const recentsState = useAsyncData(useCallback(() => fetchRecentCourtTeams(courtId), [courtId]));

  const reloadAll = useCallback(() => {
    matchState.reload();
    teamsState.reload();
    courtsState.reload();
    scheduleState.reload();
    recentsState.reload();
  }, [courtsState, matchState, recentsState, scheduleState, teamsState]);

  usePolling(reloadAll);
  return { courtsState, matchState, teamsState, scheduleState, recentsState, reloadAll };
}

export function useCourtConsole(courtId: string) {
  const { courtsState, matchState, teamsState, scheduleState, recentsState, reloadAll } =
    useCourtConsoleData(courtId);

  const { start, complete, cancel } = useConsoleActions(reloadAll);

  const seats = useTeamSeats();
  const { teamAId, setTeamAId, teamBId, setTeamBId } = seats;

  const court = useMemo(
    () => (courtsState.data?.items ?? []).find((item) => item.id === courtId) ?? null,
    [courtsState.data, courtId],
  );
  const teams = teamsState.data?.items ?? [];
  const match: MatchView | null = matchState.data?.match ?? null;
  const canStart = isStartable({ teamAId, teamBId, isPending: start.isPending });
  const schedule: CourtSchedule = scheduleState.data ?? EMPTY_SCHEDULE;
  const upNext: FixtureView | null = schedule.upNext[0] ?? null;
  useSchedulePrepopulation({ match, upNext, teamAId, teamBId, setTeamAId, setTeamBId });

  const liveScore = useLiveScore(match, reloadAll);
  const { endingMode, leadingTeamId } = readScoreboard(match, liveScore);

  const endings = makeEndingHandlers({ match, leadingTeamId, complete, cancel });

  const starting = makeStartHandlers({ courtId, run: (payload) => start.run(payload), clear: seats.clear });

  return {
    tournament: schedule.tournament,
    upNext,
    upNextList: schedule.upNext,
    speedStart: starting.speedStart,
    isScheduledPair: isPairScheduled(schedule.pendingPairs, teamAId, teamBId),
    court,
    match,
    teams,
    recentTeamIds: recentsState.data?.teamIds ?? [],
    hasEnoughTeams: teams.length >= 2,
    teamAId,
    setTeamAId,
    teamBId,
    setTeamBId,
    canStart,
    scoreA: liveScore.scoreA,
    scoreB: liveScore.scoreB,
    bumpScore: liveScore.bump,
    endingMode,
    leadingTeamId,
    ...endings,
    startMatchNow: () => starting.startPair(teamAId, teamBId),
    isBusy: start.isPending || complete.isPending || cancel.isPending,
    // A score tap must not freeze the rest of the console, so it is deliberately not in isBusy.
    isScoring: liveScore.isPending,
    isLoading: matchState.isLoading || teamsState.isLoading,
    error: firstError([matchState.error, start.error, complete.error, cancel.error, liveScore.error]),
    reload: reloadAll,
  };
}

/**
 * ADR-114 — the score the marshal is looking at, which is not always the score the server
 * has confirmed.
 *
 * The console re-reads every court on a 45–75s poll. Without this, a tap and a poll that
 * crossed in flight would paint the OLD score back over the new one, and the marshal would
 * watch the number they just pressed count itself backwards. So a tap is shown
 * immediately and that optimistic value is held — surviving any number of stale polls —
 * until a read actually comes back carrying it. A rejected tap drops the value and the
 * real score reappears, which is the correct outcome for the stale-screen case: the
 * server's refusal is exactly how a slept-through phone finds out it was behind.
 */
interface LiveScore {
  scoreA: number;
  scoreB: number;
  bump: (side: 'a' | 'b', to: number) => void;
  isPending: boolean;
  error: string | null;
}

function useLiveScore(match: MatchView | null, reloadAll: () => void): LiveScore {
  const [optimistic, setOptimistic] = useState<{ a: number | null; b: number | null }>({
    a: null,
    b: null,
  });
  const score = useAction(setMatchScore, reloadAll);

  const serverA = match?.scoreA ?? 0;
  const serverB = match?.scoreB ?? 0;

  // The server has caught up (or the match changed underneath us): stop pretending.
  useEffect(() => {
    setOptimistic((held) => {
      const a = held.a === null || held.a === serverA ? null : held.a;
      const b = held.b === null || held.b === serverB ? null : held.b;
      return a === held.a && b === held.b ? held : { a, b };
    });
  }, [serverA, serverB]);

  const scoreA = optimistic.a ?? serverA;
  const scoreB = optimistic.b ?? serverB;

  const bump = useCallback(
    (side: 'a' | 'b', to: number) => {
      if (!match) return;
      const from = side === 'a' ? scoreA : scoreB;
      setOptimistic((held) => ({ ...held, [side]: to }));
      void score.run({ matchId: match.id, side, from, to }).then((outcome) => {
        if (!outcome) setOptimistic((held) => ({ ...held, [side]: null }));
      });
    },
    [match, score, scoreA, scoreB],
  );

  return { scoreA, scoreB, bump, isPending: score.isPending, error: score.error };
}

/**
 * The four ways a live match leaves the court, as one unit.
 *
 * ADR-114 — `endMatchNow` needs no argument because the score already names the winner.
 * ADR-152 — `declareDraw` is its own handler rather than `declareWinner(null)`: a draw is a
 * different act from naming a team, and the page should not have to pass an absence.
 * `declareWinner` now survives only for the unscored knockout case, where a draw is illegal
 * and there is no score to read the winner from.
 */
function makeEndingHandlers(input: {
  match: MatchView | null;
  leadingTeamId: string | null;
  complete: {
    run: (payload: { matchId: string; winnerTeamId: string | null; tiebreakMethod?: 'coin_toss' | 'rock_paper_scissors' | null }) => Promise<unknown>;
  };
  cancel: { run: (matchId: string) => Promise<unknown> };
}) {
  const { match, leadingTeamId, complete, cancel } = input;
  return {
    endMatchNow: () => {
      if (match && leadingTeamId) {
        void complete.run({ matchId: match.id, winnerTeamId: leadingTeamId });
      }
    },
    declareWinner: (winnerTeamId: string) => {
      if (match) void complete.run({ matchId: match.id, winnerTeamId });
    },
    /** ADR-329 F5 — the toss or the scissors-paper-stone names the winner; the score stays as played. */
    declareTiebreakWinner: (winnerTeamId: string, tiebreakMethod: 'coin_toss' | 'rock_paper_scissors') => {
      if (match) void complete.run({ matchId: match.id, winnerTeamId, tiebreakMethod });
    },
    declareDraw: () => {
      if (match) void complete.run({ matchId: match.id, winnerTeamId: null });
    },
    cancelMatchNow: () => {
      if (match) void cancel.run(match.id);
    },
  };
}

/**
 * ADR-152 (F-1) — how this match is allowed to end, as one word.
 *
 * The console used to decide with nested ternaries over `isScored` and `leadingTeamId`,
 * which was readable while a level score meant exactly one thing. It now means three,
 * depending on the stage and whether anybody has scored, so the question is answered once
 * and named:
 *
 * - `win`      somebody leads; the score names the winner and the button says so.
 * - `draw`     level, and this stage may be drawn — including 0 - 0.
 * - `overtime` level in a knockout, with points on the board. Golden point: play on.
 * - `untracked` 0 - 0 in a knockout. Nothing can be read from the score and a draw is
 *   illegal, so a human names the winner. This is the only survivor of the old 0 - 0
 *   path, and it must survive: without it an unscored knockout could never be closed.
 */
export type EndingMode = 'win' | 'draw' | 'overtime' | 'untracked';

function readScoreboard(
  match: MatchView | null,
  live: { scoreA: number; scoreB: number },
): { endingMode: EndingMode; leadingTeamId: string | null } {
  if (!match) return { endingMode: 'untracked', leadingTeamId: null };
  /*
   * ADR-157 — this used to be four lines of its own, a third copy of a rule the completion
   * route and the correction desk each held differently. The marshal's console and the
   * superadmin's correction dialog now read the same function, so a score cannot mean one
   * thing at the court and another at the desk.
   */
  const outcome = readMatchOutcome({ ...live, teamAId: match.teamAId, teamBId: match.teamBId, stage: match.stage });
  return { endingMode: outcome.mode, leadingTeamId: outcome.winnerTeamId };
}

/** The two pickers as one unit, so both start paths clear them through one hand. */
function useTeamSeats() {
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const clear = useCallback(() => {
    setTeamAId('');
    setTeamBId('');
  }, []);
  return { teamAId, setTeamAId, teamBId, setTeamBId, clear };
}

/**
 * ADR-108 — the two start paths (speed button, manual pickers) share one contract: start
 * the pair, and on success empty the pickers so the next idle state offers fresh instead
 * of pointing a loaded form at the pair that just walked off (P5/D-2).
 */
function makeStartHandlers(input: {
  courtId: string;
  run: (payload: { courtId: string; teamAId: string; teamBId: string }) => Promise<unknown>;
  clear: () => void;
}) {
  const startPair = (teamAId: string, teamBId: string) => {
    void input.run({ courtId: input.courtId, teamAId, teamBId }).then((outcome) => {
      if (outcome) input.clear();
    });
  };
  return {
    startPair,
    speedStart: (fixture: FixtureView) => {
      if (fixture.teamAId === null || fixture.teamBId === null) return;
      startPair(fixture.teamAId, fixture.teamBId);
    },
  };
}

/** The console's three writes, each reloading every read on success. */
function useConsoleActions(reloadAll: () => void) {
  return {
    start: useAction(startMatch, reloadAll),
    complete: useAction(completeMatch, reloadAll),
    cancel: useAction(cancelMatch, reloadAll),
  };
}

/** F22 — two different teams must be chosen before the court can go live (fds.md §2.6). */
function isStartable(input: { teamAId: string; teamBId: string; isPending: boolean }): boolean {
  if (input.isPending) return false;
  if (!input.teamAId || !input.teamBId) return false;
  return input.teamAId !== input.teamBId;
}

const EMPTY_SCHEDULE: CourtSchedule = { tournament: null, upNext: [], pendingPairs: [] };

/*
 * ADR-089 — prepopulate the suggestion, never fight the human. The fixture is written into
 * the selects only while BOTH are empty: the moment a facilitator touches either, their
 * choice stands, and a reload cannot snatch it back.
 */
function useSchedulePrepopulation(input: {
  match: MatchView | null;
  upNext: FixtureView | null;
  teamAId: string;
  teamBId: string;
  setTeamAId: (id: string) => void;
  setTeamBId: (id: string) => void;
}): void {
  const { match, upNext, teamAId, teamBId, setTeamAId, setTeamBId } = input;
  useEffect(() => {
    if (match || !upNext || teamAId !== '' || teamBId !== '') return;
    if (upNext.teamAId === null || upNext.teamBId === null) return;
    setTeamAId(upNext.teamAId);
    setTeamBId(upNext.teamBId);
  }, [match, setTeamAId, setTeamBId, teamAId, teamBId, upNext]);
}

/** The scheduled/friendly line compares the UNORDERED pair, like the server's claim. */
function isPairScheduled(
  pairs: CourtSchedule['pendingPairs'],
  teamAId: string,
  teamBId: string,
): boolean {
  if (!teamAId || !teamBId) return false;
  return pairs.some(
    (pair) =>
      (pair.teamAId === teamAId && pair.teamBId === teamBId) ||
      (pair.teamAId === teamBId && pair.teamBId === teamAId),
  );
}
