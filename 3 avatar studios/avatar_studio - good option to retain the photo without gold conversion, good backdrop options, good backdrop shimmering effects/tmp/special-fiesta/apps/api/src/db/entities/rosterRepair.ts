import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AppDatabase, Executor } from '../client.js';
import { newId } from '../ids.js';
import { teamMemberships, teams } from '../schema/index.js';
import type { TeamChatMessageRow, TeamRow } from '../schema/index.js';
import { announceRosterEvent, forgetMemberships, removeMembershipWithin } from './teams.js';
import type { LeaveOutcome } from './teams.js';
import { recordRosterEvent } from './teamChat.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * ADR-154 — the superadmin's roster repair primitives.
 *
 * Every one of these is history-safe by construction, and the reason bounds the whole feature:
 * team points reach a person only through a roster snapshot frozen when they were paid (ADR-005,
 * now carried by the award batch, ADR-248 — ADR-270 removed the match table that first held it).
 * `team_membership` is never consulted for historical points, so moving someone at 11:40 cannot
 * disturb a point they earned at 10:15.
 *
 * These live apart from `teams.ts` because the participant-facing door and the staff door are
 * different authorisations over the same tables, and because `teams.ts` was long enough.
 */

/**
 * Announce after COMMIT, never inside the transaction (ADR-063). A line published from a
 * transaction that later rolled back reaches every open phone in the team and then does not
 * exist on reload, which is worse than no line at all.
 *
 * Plural where `withRosterAnnouncement` is singular: a *move* is two rooms, and the team losing
 * a player has as much right to the record as the team gaining one.
 */
async function announcingAll<T extends { announce: (TeamChatMessageRow | null)[] }>(
  db: AppDatabase,
  work: (tx: Executor) => Promise<T>,
): Promise<T> {
  const result = await db.transaction(work);
  // ADR-162 — after the COMMIT, before the lines go out. Every repair that reaches here moved
  // somebody between rooms, and a move is two memberships rather than one.
  forgetMemberships();
  for (const row of result.announce) {
    if (row) announceRosterEvent(row.teamId, row);
  }
  return result;
}

export interface MoveOutcome {
  /** What happened to the team they left — it may have lost its captain, or its last member. */
  from: LeaveOutcome;
}

/**
 * Move a participant from one team to another, as ONE transaction.
 *
 * `ux_team_membership_active_participant` is a partial unique index: one active membership per
 * participant. Expire-then-insert in the wrong order is a `23505`, and a browser doing this as
 * two calls could crash between them and leave a participant on no team at all. So this is one
 * route and one transaction, and the ordering below (expire, then insert) is load-bearing.
 *
 * The lock on the destination is deliberately not consulted. A locked team is a captain's
 * statement that their roster is settled, and this door exists precisely for when that
 * statement is wrong and the captain is unreachable.
 */
export async function moveMember(
  db: AppDatabase,
  input: { participantId: string; fromTeamId: string; toTeamId: string },
): Promise<MoveOutcome> {
  const result = await announcingAll(db, async (tx) => {
    const removal = await removeMembershipWithin(tx, {
      teamId: input.fromTeamId,
      participantId: input.participantId,
      kind: 'staff_removed',
    });
    await tx.insert(teamMemberships).values({
      id: newId(),
      teamId: input.toTeamId,
      participantId: input.participantId,
    });
    const arrival = await recordRosterEvent(tx, {
      teamId: input.toTeamId,
      participantId: input.participantId,
      kind: 'staff_added',
    });
    return { from: removal.outcome, announce: [removal.announce, arrival] };
  });
  return { from: result.from };
}

/**
 * Add a participant to a team on staff authority — the straggler who never joined anything,
 * or who joined nothing because the code was misread. Bypasses `is_locked` for the same reason
 * `moveMember` does.
 */
export async function addMemberAsStaff(
  db: AppDatabase,
  input: { teamId: string; participantId: string },
): Promise<void> {
  await announcingAll(db, async (tx) => {
    await tx.insert(teamMemberships).values({
      id: newId(),
      teamId: input.teamId,
      participantId: input.participantId,
    });
    return { announce: [await recordRosterEvent(tx, { ...input, kind: 'staff_added' })] };
  });
}

/**
 * Remove a participant on staff authority. Inherits §4.2.3/§4.2.4 wholesale — auto-promotion
 * of the earliest-joined survivor, and disband when there are none — because the cascade is
 * correct and a second copy of it would be a second thing to get wrong. The caller's job is to
 * have *said* which of the three outcomes is coming before the superadmin pressed anything.
 */
export async function removeMemberAsStaff(
  db: AppDatabase,
  input: { teamId: string; participantId: string },
): Promise<{ outcome: LeaveOutcome }> {
  const result = await announcingAll(db, async (tx) => {
    const removal = await removeMembershipWithin(tx, { ...input, kind: 'staff_removed' });
    return { outcome: removal.outcome, announce: [removal.announce] };
  });
  return { outcome: result.outcome };
}

/**
 * ADR-154 — hand captaincy to a named member and tell the room.
 *
 * `transferCaptaincy` already exists for the captain's own use and is reused unchanged; what is
 * added here is the record, because a captaincy that changed without the team being told is the
 * sort of thing that gets discovered at the worst moment.
 */
export async function transferCaptaincyAsStaff(
  db: AppDatabase,
  input: { teamId: string; fromParticipantId: string; toParticipantId: string },
): Promise<void> {
  await announcingAll(db, async (tx) => {
    await tx
      .update(teamMemberships)
      .set({ isCaptain: false })
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.participantId, input.fromParticipantId),
          isNull(teamMemberships.expiresAt),
        ),
      );
    await tx
      .update(teamMemberships)
      .set({ isCaptain: true })
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.participantId, input.toParticipantId),
          isNull(teamMemberships.expiresAt),
        ),
      );
    await tx
      .update(teams)
      .set({ captainParticipantId: input.toParticipantId })
      .where(eq(teams.id, input.teamId));
    return {
      announce: [
        await recordRosterEvent(tx, {
          teamId: input.teamId,
          participantId: input.toParticipantId,
          kind: 'captain_changed',
        }),
      ],
    };
  });
}

/** The captain's phone died with the team locked. No subject participant, so no record (§8). */
export async function forceUnlockTeam(db: Executor, teamId: string): Promise<TeamRow | null> {
  return firstOrNull(
    await db.update(teams).set({ isLocked: false }).where(eq(teams.id, teamId)).returning(),
  );
}

/** The cascade the confirmation must be able to name before it happens (§6). */
export async function memberCountOf(db: Executor, teamId: string): Promise<number> {
  const row = firstOrThrow(
    await db
      .select({ count: sql<number>`count(*)::int` })
      .from(teamMemberships)
      .where(and(eq(teamMemberships.teamId, teamId), isNull(teamMemberships.expiresAt))),
    'Member count returned no row',
  );
  return row.count;
}
