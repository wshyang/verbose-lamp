import { useCallback, useState } from 'react';
import type { AdminMatchView, AdminStageView } from '@psd/contracts';
import * as desk from '../api/tournament.js';
import type { TournamentDesk } from './useTournamentDesk.js';

/**
 * ADR-279 — the live desk's acts that need a reason (fds.md §2.13): correct, walkover, void and
 * unvoid, call off, complete a stage, withdraw, award, stop the scheduler, close the day. One pending
 * act at a time behind one ReasonDialog, so no correction surface can forget to ask why.
 */

export type DeskAct =
  | { kind: 'correct'; match: AdminMatchView }
  | { kind: 'walkover'; match: AdminMatchView; winnerSide: 'a' | 'b' }
  | { kind: 'reseat'; match: AdminMatchView; side?: 'a' | 'b'; teamId?: string }
  | { kind: 'handBack'; match: AdminMatchView }
  | { kind: 'void'; match: AdminMatchView }
  | { kind: 'cancel'; match: AdminMatchView }
  | { kind: 'completeStage'; stageId: string; label: string; stage?: AdminStageView }
  | { kind: 'restage'; stageId: string; label: string; stage: AdminStageView }
  | { kind: 'withdraw'; teamId: string; name: string }
  | { kind: 'award'; teamId: string; name: string }
  | { kind: 'terminate' }
  | { kind: 'close' };

const TITLES: { [K in DeskAct['kind']]: (act: Extract<DeskAct, { kind: K }>) => string } = {
  correct: (act) => `Correct ${act.match.code}`,
  walkover: (act) => `Walkover in ${act.match.code}`,
  reseat: (act) => `Reseat ${act.match.code}`,
  handBack: (act) => `Hand back ${act.match.code}`,
  void: (act) => (act.match.isVoided ? `Reinstate ${act.match.code}` : `Void ${act.match.code}`),
  cancel: (act) => `Call off ${act.match.code}`,
  completeStage: (act) => `Close ${act.label}`,
  restage: (act) => `Rebuild ${act.label}`,
  withdraw: (act) => `Withdraw ${act.name}`,
  award: (act) => `Award points to ${act.name}`,
  terminate: () => 'Stop the scheduler for good',
  close: () => 'Close the tournament',
};

/** The dialog's heading for an act. */
export function titleOf(act: DeskAct): string {
  return (TITLES[act.kind] as (value: DeskAct) => string)(act);
}

export interface ActExtras {
  scoreA: string;
  scoreB: string;
  points: string;
  /** ADR-329 F5 — the off-scoreboard settlement of a corrected level knockout; empty means none. */
  tiebreakMethod: '' | 'coin_toss' | 'rock_paper_scissors';
  tiebreakWinnerSide: '' | 'a' | 'b';
  /** place (as a string) → the teamId that takes it instead of the table's choice; absent/empty keeps the table. */
  overridePlaces: Record<string, string>;
  reseatSide: 'a' | 'b';
  reseatTeamId: string;
  /** ADR-334 — the restage knobs, all as typed; an empty box means "keep the plan's value". */
  restageGroupSize: string;
  restageAdvanceCount: string;
  restageIntakeCount: string;
  restageMinutes: string;
  restageTablePoints: string;
  restageThirdPlace: 'keep' | 'yes' | 'no';
}

const NO_EXTRAS: ActExtras = {
  scoreA: '',
  scoreB: '',
  points: '',
  tiebreakMethod: '',
  tiebreakWinnerSide: '',
  overridePlaces: {},
  reseatSide: 'a',
  reseatTeamId: '',
  restageGroupSize: '',
  restageAdvanceCount: '',
  restageIntakeCount: '',
  restageMinutes: '',
  restageTablePoints: '',
  restageThirdPlace: 'keep',
};

type Write = () => ReturnType<typeof desk.closeTournament>;

type Writer<K extends DeskAct['kind']> = (act: Extract<DeskAct, { kind: K }>, input: { reason: string; extras: ActExtras }) => Write;

const WRITERS: { [K in DeskAct['kind']]: Writer<K> } = {
  correct: (act, { reason, extras }) => () =>
    desk.correctResult({
      matchId: act.match.id,
      scoreA: Number(extras.scoreA),
      scoreB: Number(extras.scoreB),
      winnerSide: extras.tiebreakMethod === '' || extras.tiebreakWinnerSide === '' ? null : extras.tiebreakWinnerSide,
      tiebreakMethod: extras.tiebreakMethod === '' ? null : extras.tiebreakMethod,
      reason,
    }),
  walkover: (act, { reason }) => () => desk.recordWalkover({ matchId: act.match.id, winnerSide: act.winnerSide, reason }),
  reseat: (act, { reason, extras }) => () =>
    desk.reseatMatch({ matchId: act.match.id, side: extras.reseatSide, teamId: extras.reseatTeamId, reason }),
  handBack: (act, { reason }) => () => desk.handBackMatch({ matchId: act.match.id, reason: reason === '' ? null : reason }),
  void: (act, { reason }) => () => desk.setMatchVoided({ matchId: act.match.id, isVoided: !act.match.isVoided, reason }),
  cancel: (act, { reason }) => () => desk.cancelMatch({ matchId: act.match.id, reason }),
  // An overrule needs a reason; closing on the table as it stands does not.
  completeStage: (act, { reason, extras }) => () => {
    const overrides = Object.entries(extras.overridePlaces)
      .filter(([, teamId]) => teamId !== '')
      .map(([place, teamId]) => ({ place: Number(place), teamId }));
    return desk.completeStage({ stageId: act.stageId, overrides, reason: reason === '' ? null : reason });
  },
  restage: (act, { reason, extras }) => () => {
    const number = (value: string) => (value.trim() === '' ? undefined : Number(value));
    const points = extras.restageTablePoints.trim().split(/\s+/).filter((part) => part !== '').map(Number);
    return desk.restructureStage({
      stageId: act.stageId,
      body: {
        reason,
        ...(number(extras.restageGroupSize) !== undefined ? { groupSize: number(extras.restageGroupSize) } : {}),
        ...(number(extras.restageAdvanceCount) !== undefined ? { advanceCount: number(extras.restageAdvanceCount) } : {}),
        ...(number(extras.restageIntakeCount) !== undefined ? { intakeCount: number(extras.restageIntakeCount) } : {}),
        ...(number(extras.restageMinutes) !== undefined ? { matchMinutes: number(extras.restageMinutes) } : {}),
        ...(extras.restageThirdPlace !== 'keep' ? { hasThirdPlace: extras.restageThirdPlace === 'yes' } : {}),
        ...(points.length === 3 ? { tablePoints: { win: points[0] as number, draw: points[1] as number, loss: points[2] as number } } : {}),
      },
    });
  },
  withdraw: (act, { reason }) => () => desk.withdrawTeam({ teamId: act.teamId, reason }),
  award: (act, { reason, extras }) => () => desk.awardPoints({ teamId: act.teamId, points: Number(extras.points), reason }),
  terminate: (_act, { reason }) => () => desk.terminateScheduler(reason),
  // A day that ends on time needs no reason; the API asks for one only if matches are still unplayed.
  close: (_act, { reason }) => () => desk.closeTournament(reason === '' ? null : reason),
};

/** The write an act makes, given the reason and the act's own extra fields. */
export function writeOf(act: DeskAct, input: { reason: string; extras: ActExtras }): Write {
  return (WRITERS[act.kind] as Writer<DeskAct['kind']>)(act as never, input);
}

export function useTournamentActs(deskState: TournamentDesk) {
  const { perform, clearError } = deskState;
  const [act, setAct] = useState<DeskAct | null>(null);
  const [reason, setReason] = useState('');
  const [extras, setExtras] = useState<ActExtras>(NO_EXTRAS);

  const open = useCallback(
    (next: DeskAct) => {
      clearError();
      setReason('');
      const scores = next.kind === 'correct' ? { scoreA: String(next.match.scoreA), scoreB: String(next.match.scoreB) } : {};
      const reseat =
        next.kind === 'reseat' ? { reseatSide: next.side ?? ('a' as const), reseatTeamId: next.teamId ?? '' } : {};
      setExtras({ ...NO_EXTRAS, ...scores, ...reseat });
      setAct(next);
    },
    [clearError],
  );

  const confirm = useCallback(async () => {
    if (act === null) return;
    if (await perform(writeOf(act, { reason: reason.trim(), extras }))) setAct(null);
  }, [act, extras, perform, reason]);

  const patchExtras = useCallback((patch: Partial<ActExtras>) => setExtras((current) => ({ ...current, ...patch })), []);
  return { act, title: act === null ? '' : titleOf(act), reason, setReason, extras, patchExtras, open, confirm, cancel: () => setAct(null) };
}

export type TournamentActs = ReturnType<typeof useTournamentActs>;
