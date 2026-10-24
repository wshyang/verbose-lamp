import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { AppDatabase, Executor } from '../client.js';
import { newId, newJoinCode } from '../ids.js';
import { publishTeamChatMessage } from '../../lib/chatBus.js';
import { cachedRead, invalidateTag, MEMBERSHIP_TAG, teamChatTag } from '../../lib/cache.js';
import { publishTeamChatActivity } from '../../lib/statusBus.js';
import { teamChatMessageView } from '../../views/teamChat.js';
import { participants, teamMemberships, teams } from '../schema/index.js';
import type { RosterSnapshotEntry, TeamChatMessageRow, TeamMembershipRow, TeamRow } from '../schema/index.js';
import { recordRosterEvent } from './teamChat.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';

/**
 * Team domain — fds.md §2.3/§2.4, §3.1 #state-team, §4.2.1–4.
 * Removal is always soft; the partial unique indexes do the heavy lifting.
 */

const activeMembership = isNull(teamMemberships.expiresAt);
const activeTeam = isNull(teams.disbandedAt);

export interface TeamMemberRecord {
  participantId: string;
  nickname: string;
  clusterCode: string;
  gender: 'male' | 'female';
  avatarVariant: number;
  avatarLook: string;
  avatarPhoto: string | null;
  /** ADR-061 — carried so the avatar peek can name them properly (ADR-062). */
  title: string;
  isCaptain: boolean;
  joinedAt: Date;
}

export interface TeamSummaryRecord {
  id: string;
  teamName: string;
  joinCode: string;
  captainNickname: string;
  memberCount: number;
  isLocked: boolean;
  createdAt: Date;
}

export async function findTeamById(db: Executor, teamId: string): Promise<TeamRow | null> {
  return firstOrNull(await db.select().from(teams).where(and(eq(teams.id, teamId), activeTeam)));
}

export async function findTeamByJoinCode(db: Executor, joinCode: string): Promise<TeamRow | null> {
  return firstOrNull(await db
    .select()
    .from(teams)
    .where(and(eq(teams.joinCode, joinCode.toUpperCase()), activeTeam)));
}

/** fds.md §4.2.10 — team name uniqueness is case-insensitive. */
export async function findTeamByName(db: Executor, teamName: string): Promise<TeamRow | null> {
  return firstOrNull(await db
    .select()
    .from(teams)
    .where(and(eq(sql`lower(${teams.teamName})`, teamName.toLowerCase()), activeTeam)));
}

async function activeMembershipFromDb(
  db: Executor,
  participantId: string,
): Promise<TeamMembershipRow | null> {
  return firstOrNull(await db
    .select()
    .from(teamMemberships)
    .where(and(eq(teamMemberships.participantId, participantId), activeMembership)));
}

/**
 * ADR-162 — one second, and the reasoning is at `MEMBERSHIP_TAG`.
 *
 * Deliberately an order of magnitude below every other TTL in `cache.ts`, because this is the
 * one cached read that answers "may this person have this frame". The window exists to collapse
 * the burst of deliveries a single message causes — all of which land in the same tick — not to
 * avoid asking the database.
 */
const MEMBERSHIP_CACHE_TTL_MS = 1_000;

/**
 * The active membership, memoised for a second and voided by every write that can change it.
 *
 * The returned row carries `isCaptain`, so **captaincy changes invalidate too** — not only
 * joins and leaves. That is easy to miss when reasoning about this as "is she on a team", and
 * it is why `promoteCaptain` and `transferCaptaincy` are on the list of writers that forget.
 */
export const findActiveMembership = cachedRead(activeMembershipFromDb, {
  name: 'teams.activeMembership',
  ttlMs: MEMBERSHIP_CACHE_TTL_MS,
  tags: [MEMBERSHIP_TAG],
  key: (participantId) => participantId,
});

/**
 * Forget every memoised membership. Called after each roster write COMMITS.
 *
 * After, never inside. `cachedRead` would otherwise be free to answer a concurrent reader from
 * the uncommitted state and pin that answer for the full TTL — the same hazard
 * `announceRosterEvent` documents for the team-chat watermark, and the reason that function
 * voids its tag a second time once the write is durable.
 *
 * Exported, and named rather than inlined as `invalidateTag(MEMBERSHIP_TAG)`, so the standards
 * check can insist that any module writing `team_membership` also calls it (`membership-void`).
 */
export function forgetMemberships(): void {
  invalidateTag(MEMBERSHIP_TAG);
}

export async function listTeamMembers(db: Executor, teamId: string): Promise<TeamMemberRecord[]> {
  return db
    .select({
      participantId: participants.id,
      nickname: participants.nickname,
      clusterCode: participants.clusterCode,
      gender: participants.gender,
      avatarVariant: participants.avatarVariant,
      avatarLook: participants.avatarLook,
      avatarPhoto: participants.avatarPhoto,
      title: participants.title,
      isCaptain: teamMemberships.isCaptain,
      joinedAt: teamMemberships.joinedAt,
    })
    .from(teamMemberships)
    .innerJoin(participants, eq(participants.id, teamMemberships.participantId))
    .where(and(eq(teamMemberships.teamId, teamId), activeMembership))
    .orderBy(asc(teamMemberships.joinedAt));
}

/** S9 browse — name, member count, captain nickname, lock status. */
export async function listTeams(db: Executor): Promise<TeamSummaryRecord[]> {
  return db
    .select({
      id: teams.id,
      teamName: teams.teamName,
      joinCode: teams.joinCode,
      captainNickname: participants.nickname,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM team_membership m
        WHERE m.team_id = ${teams.id} AND m.expires_at IS NULL
      )`,
      isLocked: teams.isLocked,
      createdAt: teams.createdAt,
    })
    .from(teams)
    .innerJoin(participants, eq(participants.id, teams.captainParticipantId))
    .where(activeTeam)
    .orderBy(asc(sql`lower(${teams.teamName})`));
}

export async function countTeams(db: Executor): Promise<number> {
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(teams).where(activeTeam);
  return firstOrDefault(rows, { total: 0 }).total;
}

/** F6 — creator becomes captain in the same transaction that mints the team. */
/**
 * ADR-130 — everything a committed roster line owes the rest of the system, in one place.
 *
 * There are three obligations and they were not kept together, which is how two of them drifted
 * apart. The line goes on the chat bus for the phones that have the room open; the watermark
 * goes on the status bus for the phones that do not, because `latestTeamChatActivityFromDb`
 * filters on `hiddenAt` and nothing else — the snapshot counts roster rows, so the live path
 * must too or a reconnect lights a dot the socket never did. And the tag is voided here rather
 * than only at the insert: `createTeamChatMessage` runs inside the caller's transaction, so its
 * own void lands before the COMMIT and a reader in that window can pin pre-commit state for the
 * full ten-minute TTL. Voiding again once the write is durable discards that entry.
 *
 * Exported so the publish/invalidate pairing has a single testable seam.
 */
export function announceRosterEvent(teamId: string, row: TeamChatMessageRow): void {
  invalidateTag(teamChatTag(teamId));
  publishTeamChatMessage(teamId, teamChatMessageView(row));
  publishTeamChatActivity(teamId, row.createdAt);
}

/**
 * ADR-063 — run a roster change in a transaction, then announce it.
 *
 * The announcement has to happen AFTER the commit. A message published from inside a transaction
 * that later rolled back would be delivered to every open phone in the team and then not exist on
 * reload, which is worse than a missing line. So the body returns the row it wants announced and
 * this publishes it once the write is durable.
 */
async function withRosterAnnouncement<T extends { announce: TeamChatMessageRow | null }>(
  db: AppDatabase,
  work: (tx: Executor) => Promise<T>,
): Promise<T> {
  const result = await db.transaction(work);
  // Unconditional, where the announcement is not: a roster change that produced no chat line
  // (a captaincy promotion, say) still changed who may read what.
  forgetMemberships();
  if (result.announce) announceRosterEvent(result.announce.teamId, result.announce);
  return result;
}

export async function createTeamWithCaptain(
  db: AppDatabase,
  input: { teamName: string; captainParticipantId: string },
): Promise<TeamRow> {
  return (
    await withRosterAnnouncement(db, async (tx) => {
    const team = firstOrThrow(
      await tx
        .insert(teams)
        .values({
          id: newId(),
          teamName: input.teamName,
          joinCode: newJoinCode(),
          captainParticipantId: input.captainParticipantId,
        })
        .returning(),
      'Team',
    );
    await tx.insert(teamMemberships).values({
      id: newId(),
      participantId: input.captainParticipantId,
      teamId: team.id,
      isCaptain: true,
    });
    // ADR-063 — the captain joining is the first line of the team's history.
    const opened = await recordRosterEvent(tx, {
      teamId: team.id,
      participantId: input.captainParticipantId,
      kind: 'joined',
    });
      return { team, announce: opened };
    })
  ).team;
}

export async function addTeamMember(
  db: Executor,
  input: { teamId: string; participantId: string },
): Promise<TeamMembershipRow> {
  const membership = firstOrThrow(
    await db
      .insert(teamMemberships)
      .values({ id: newId(), teamId: input.teamId, participantId: input.participantId })
      .returning(),
    'Membership insert returned no row',
  );
  forgetMemberships();
  // ADR-063 — announced immediately because this one has no transaction of its own to wait for.
  const announce = await recordRosterEvent(db, { ...input, kind: 'joined' });
  if (announce) announceRosterEvent(input.teamId, announce);
  return membership;
}

async function nextCaptainId(tx: Executor, input: { teamId: string; leavingId: string }) {
  const next = firstOrNull(
    await tx
      .select({ participantId: teamMemberships.participantId })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          activeMembership,
          sql`${teamMemberships.participantId} <> ${input.leavingId}`,
        ),
      )
      .orderBy(asc(teamMemberships.joinedAt)),
  );
  return next?.participantId ?? null;
}

async function promoteCaptain(tx: Executor, input: { teamId: string; participantId: string }) {
  await tx
    .update(teamMemberships)
    .set({ isCaptain: true })
    .where(
      and(
        eq(teamMemberships.teamId, input.teamId),
        eq(teamMemberships.participantId, input.participantId),
        activeMembership,
      ),
    );
  await tx
    .update(teams)
    .set({ captainParticipantId: input.participantId })
    .where(eq(teams.id, input.teamId));
}


/**
 * ADR-005 — who is on a team right now, frozen by the caller into whatever it pays (an award batch row
 * today, the rebuilt tournament's rosters next). ADR-270 moved it here from the removed `matches.ts`:
 * a roster is a fact about a team, so the team domain is where it lives. One spelling of "who was on
 * the team" is what keeps a board and a ledger from disagreeing.
 */
export async function rosterSnapshot(tx: Executor, teamId: string): Promise<RosterSnapshotEntry[]> {
  return tx
    .select({
      participantId: participants.id,
      nickname: participants.nickname,
      clusterCode: participants.clusterCode,
    })
    .from(teamMemberships)
    .innerJoin(participants, eq(participants.id, teamMemberships.participantId))
    .where(and(eq(teamMemberships.teamId, teamId), activeMembership));
}

export type LeaveOutcome = 'left' | 'captaincy_transferred' | 'team_disbanded';

export interface MembershipRemoval {
  outcome: LeaveOutcome;
  announce: TeamChatMessageRow | null;
}

/**
 * The removal itself, inside a caller's transaction — §4.2.3 auto-transfer to the earliest
 * `joined_at`, §4.2.4 disband when the last member leaves.
 *
 * Split out of `invalidateMembership` for ADR-154: a staff *move* has to expire one membership
 * and insert another atomically, so it cannot call a function that opens its own transaction,
 * and the captain cascade is far too subtle to have a second copy. One implementation, three
 * callers — leave, staff removal, and the first half of a move.
 *
 * `kind` rides in the input object rather than as a fourth parameter, and it is the *reason*
 * for the removal rather than a flag: the room must not be told the member left when an
 * organiser took them out.
 */
export async function removeMembershipWithin(
  tx: Executor,
  input: { teamId: string; participantId: string; kind: 'left' | 'staff_removed' },
): Promise<MembershipRemoval> {
  const removed = firstOrThrow(
    await tx
      .update(teamMemberships)
      .set({ expiresAt: new Date() })
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.participantId, input.participantId),
          activeMembership,
        ),
      )
      .returning(),
    'No active membership to invalidate',
  );
  const announce = await recordRosterEvent(tx, input);
  if (!removed.isCaptain) return { outcome: 'left', announce };
  const successorId = await nextCaptainId(tx, {
    teamId: input.teamId,
    leavingId: input.participantId,
  });
  if (!successorId) {
    await tx.update(teams).set({ disbandedAt: new Date() }).where(eq(teams.id, input.teamId));
    return { outcome: 'team_disbanded', announce };
  }
  await promoteCaptain(tx, { teamId: input.teamId, participantId: successorId });
  return { outcome: 'captaincy_transferred', announce };
}

/**
 * F10/F12 — leaving and being kicked. The participant-facing door, unchanged in behaviour.
 */
export async function invalidateMembership(
  db: AppDatabase,
  input: { teamId: string; participantId: string },
): Promise<LeaveOutcome> {
  const result = await withRosterAnnouncement(db, async (tx) =>
    removeMembershipWithin(tx, { ...input, kind: 'left' }),
  );
  return result.outcome;
}

/** F14 — explicit designation. Demote first: the partial unique index is checked immediately. */
export async function transferCaptaincy(
  db: AppDatabase,
  input: { teamId: string; fromParticipantId: string; toParticipantId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(teamMemberships)
      .set({ isCaptain: false })
      .where(
        and(
          eq(teamMemberships.teamId, input.teamId),
          eq(teamMemberships.participantId, input.fromParticipantId),
          activeMembership,
        ),
      );
    await promoteCaptain(tx, { teamId: input.teamId, participantId: input.toParticipantId });
  });
  // The memoised row carries `isCaptain`, so a transfer changes it for two people.
  forgetMemberships();
}

export async function lockTeam(db: Executor, teamId: string): Promise<TeamRow | null> {
  return firstOrNull(await db.update(teams).set({ isLocked: true }).where(eq(teams.id, teamId)).returning());
}

export async function unlockTeam(db: Executor, teamId: string): Promise<TeamRow | null> {
  return firstOrNull(await db
    .update(teams)
    .set({ isLocked: false })
    .where(eq(teams.id, teamId))
    .returning());
}
