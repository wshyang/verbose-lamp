import { useCallback, useState } from 'react';
import {
  addTeamMemberAsStaff,
  fetchTeamRepairContext,
  moveTeamMember,
  removeTeamMemberAsStaff,
  setTeamCaptainAsStaff,
  unlockTeamAsStaff,
  type AdminTeamMember,
  type AdminTeamRow,
  type WithdrawalView,
} from '../api/admin.js';
export type { AdminTeamMember, AdminTeamRow } from '../api/admin.js';
import {
  liveMatchWarning,
  moveConsequence,
  removalConsequence,
  withdrawalNotice,
} from '../repair/consequences.js';
import { useAction } from './useAction.js';
import { useConfirm } from './useConfirm.js';
import { useAdminTeams, useAdminParticipants } from './useAdminDirectory.js';

/**
 * ADR-154 — the console half of roster repair.
 *
 * Every action goes through the same three steps, and the middle one is the feature: READ the
 * team's state, SAY what the repair will do to it, then do it. The read is not decoration —
 * §3 (a live match costs the mover their points) and §6 (removing a lone captain disbands the
 * team) are both invisible from the directory row, so a confirmation written from the row
 * alone would be confidently wrong.
 */

interface RepairTarget {
  teamId: string;
  member: AdminTeamMember;
}

export function useTeamRepair() {
  const directory = useAdminTeams();
  const people = useAdminParticipants();
  const confirm = useConfirm();
  const [notice, setNotice] = useState<string | null>(null);
  const reload = directory.reload;

  const nameOf = useCallback(
    (teamId: string) =>
      directory.rows.find((row) => row.team.id === teamId)?.team.teamName ?? 'another team',
    [directory.rows],
  );

  /*
   * One place decides what the console says after a write. A repair that disbanded a team
   * has something to report; every other repair has nothing, and says nothing rather than
   * leaving the previous repair's sentence on screen to be read as this one's.
   */
  const settle = useCallback(
    (withdrawal: WithdrawalView | null, teamName: string) => {
      setNotice(withdrawal === null ? null : withdrawalNotice(withdrawal, teamName, nameOf));
      reload();
    },
    [nameOf, reload],
  );

  const actions = useRepairActions(settle);
  const ask = useRepairPrompts(confirm.ask, actions);

  /*
   * Who may be added. A participant already on a team cannot be added to a second one — the
   * active-membership constraint would refuse it — so the pool is exactly the un-teamed, and
   * showing anybody else would be offering a button that can only produce an error.
   */
  const unassigned = people.rows
    .filter((row) => row.teamName === null)
    .map((row) => ({ participantId: row.participant.id, nickname: row.participant.nickname }));

  return {
    rows: directory.rows,
    unassigned,
    isLoading: directory.isLoading,
    error: directory.error,
    confirm,
    notice,
    actionError: actions.error,
    isPending: actions.isPending,
    ...ask,
  };
}

/** The five writes, each reporting the withdrawal it may have caused. */
function useRepairActions(settle: (withdrawal: WithdrawalView | null, teamName: string) => void) {
  const move = useAction(
    // `teamName` rides along so `settle` can name the team afterwards; it is console
    // bookkeeping, so it is stripped here rather than posted to a server that never asked.
    (input: { participantId: string; fromTeamId: string; toTeamId: string; teamName: string }) =>
      moveTeamMember({
        participantId: input.participantId,
        fromTeamId: input.fromTeamId,
        toTeamId: input.toTeamId,
      }),
    (result, input) => settle(result.withdrawal, input.teamName),
  );
  const remove = useAction(
    (input: RepairTarget & { teamName: string }) =>
      removeTeamMemberAsStaff(input.teamId, input.member.participantId),
    (result, input) => settle(result.withdrawal, input.teamName),
  );
  const add = useAction(
    (input: { teamId: string; participantId: string }) =>
      addTeamMemberAsStaff(input.teamId, input.participantId),
    () => settle(null, ''),
  );
  const captain = useAction(
    (input: RepairTarget) => setTeamCaptainAsStaff(input.teamId, input.member.participantId),
    () => settle(null, ''),
  );
  const unlock = useAction(
    (teamId: string) => unlockTeamAsStaff(teamId),
    () => settle(null, ''),
  );
  return {
    move,
    remove,
    add,
    captain,
    unlock,
    error: move.error ?? remove.error ?? add.error ?? captain.error ?? unlock.error,
    isPending:
      move.isPending || remove.isPending || add.isPending || captain.isPending || unlock.isPending,
  };
}

type Actions = ReturnType<typeof useRepairActions>;
type Ask = ReturnType<typeof useConfirm>['ask'];

function useRepairPrompts(ask: Ask, actions: Actions) {
  return { ...useReadingPrompts(ask, actions), ...usePlainPrompts(ask, actions) };
}

/**
 * The two prompts that must READ before they ask. Both of their sentences depend on facts the
 * directory row cannot see — whether the team is on court (§3), and whether this is its last
 * member (§6) — so a confirmation written without this call would be confidently wrong.
 */
function useReadingPrompts(ask: Ask, actions: Actions) {
  const askRemove = useCallback(
    async (target: RepairTarget) => {
      const context = await fetchTeamRepairContext(target.teamId);
      ask({
        title: `Remove ${target.member.nickname}?`,
        body: removalConsequence(context, target.member.nickname),
        confirmLabel: 'Remove',
        isDanger: true,
        run: () => void actions.remove.run({ ...target, teamName: context.teamName }),
      });
    },
    [ask, actions.remove],
  );

  const askMove = useCallback(
    async (target: RepairTarget, to: { id: string; teamName: string }) => {
      const context = await fetchTeamRepairContext(target.teamId);
      const warning = liveMatchWarning(context, target.member.nickname);
      ask({
        title: `Move ${target.member.nickname}?`,
        // The live-match warning goes FIRST: it is the one that costs somebody points.
        body: [warning, moveConsequence(context, target.member.nickname, to.teamName)]
          .filter((line): line is string => line !== null)
          .join(' '),
        confirmLabel: 'Move',
        isDanger: warning !== null,
        run: () =>
          void actions.move.run({
            participantId: target.member.participantId,
            fromTeamId: target.teamId,
            toTeamId: to.id,
            teamName: context.teamName,
          }),
      });
    },
    [ask, actions.move],
  );

  return { askRemove, askMove };
}

/**
 * The two whose consequence is fully known from the row already on screen. They still ask —
 * ADR-027 — but they have nothing to look up first.
 */
function usePlainPrompts(ask: Ask, actions: Actions) {
  /*
   * Adding needs no read. The pool is already filtered to the un-teamed, and no consequence
   * of an addition is hidden from the row: nobody loses points and no team disappears. The
   * one thing worth saying out loud is that the team hears about it (§5) — a roster can be
   * changed on a captain's behalf, but never behind their back.
   */
  const askAdd = useCallback(
    (team: { id: string; teamName: string }, person: { participantId: string; nickname: string }) => {
      ask({
        title: `Add ${person.nickname} to ${team.teamName}?`,
        body: `${person.nickname} joins ${team.teamName}. The team is told, and the team's lock is not consulted — this is a repair, not a join.`,
        confirmLabel: 'Add',
        run: () => void actions.add.run({ teamId: team.id, participantId: person.participantId }),
      });
    },
    [ask, actions.add],
  );

  const askCaptain = useCallback(
    (target: RepairTarget, teamName: string) => {
      ask({
        title: `Make ${target.member.nickname} captain?`,
        body: `${target.member.nickname} becomes captain of ${teamName}. The team is told.`,
        confirmLabel: 'Make captain',
        run: () => void actions.captain.run(target),
      });
    },
    [ask, actions.captain],
  );

  const askUnlock = useCallback(
    (row: AdminTeamRow) => {
      ask({
        title: `Unlock ${row.team.teamName}?`,
        body: `${row.team.teamName} will accept new members again. The team is not told, because this is not about any one person.`,
        confirmLabel: 'Unlock',
        run: () => void actions.unlock.run(row.team.id),
      });
    },
    [ask, actions.unlock],
  );

  return { askAdd, askCaptain, askUnlock };
}
