import type { TeamChatMessageKind } from '@psd/contracts';
import { and, asc, desc, eq, gt, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { cachedRead, invalidateTag, teamChatTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { participants, teamChatMessages } from '../schema/index.js';
import type { TeamChatMessageRow, TeamMembershipRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * A team's own room (ADR-063).
 *
 * Same cost model as the global room: sending is one INSERT and no reads, because the message
 * reaches open streams through the in-process bus. Unlike the global room the PAGE reads are
 * **not** cached, and that is deliberate — a cache key would have to include both the team and
 * the member's join time, so sixty teams share almost nothing and each entry would be
 * invalidated about as often as it was read. The partial index does the work instead. The
 * activity WATERMARK is the exception (ADR-094/125): its answer is one timestamp per room,
 * shared by every member of it, and it is asked on every alerts poll and every reconnect.
 *
 * Every page read is floored at the member's `joined_at`: you see the conversation from when you
 * joined, not the planning that happened before you were in it. The watermark is deliberately
 * not floored — see `latestTeamChatActivity` for why the reader enforces that instead.
 */

/** A bounded window on catch-up; a room's scrollback is not an archive. */
export const TEAM_CHAT_PAGE_LIMIT = 200;

/**
 * ADR-087 — ADR-065's limits, which the team room never received.
 *
 * The global room was cut to fifty on open with a `before=` walk-back for the rest; this room kept
 * handing out two hundred for both of its reads. Nothing recorded a reason for the two rooms to
 * differ, so the difference was an omission rather than a decision — and it is the room a
 * participant opens most, because the tab lights up when something is said in it.
 */
export const TEAM_CHAT_TAIL_LIMIT = 50;
export const TEAM_CHAT_OLDER_LIMIT = 50;

/**
 * One row past the limit is read and then dropped, so `hasOlder` is a fact rather than the usual
 * "a full page came back, so there is probably more" guess that makes a list fire one extra empty
 * request at the end of the history.
 */
function pageOf(rows: readonly TeamChatMessageRow[], limit: number) {
  return { rows: rows.slice(0, limit), hasOlder: rows.length > limit };
}

export interface NewTeamChatMessage {
  teamId: string;
  participantId: string;
  authorLabelSnapshot: string;
  titleSnapshot: string;
  /** Omitted for a roster event, whose sentence is UI copy rather than stored text. */
  body?: string;
  kind?: TeamChatMessageKind;
}

export async function createTeamChatMessage(
  db: Executor,
  input: NewTeamChatMessage,
): Promise<TeamChatMessageRow> {
  const row = firstOrThrow(
    await db
      .insert(teamChatMessages)
      .values({ id: newId(), ...input })
      .returning(),
    'Team chat message insert returned no row',
  );
  // ADR-094 — a new line (spoken or roster) must light the unread dot on the next poll.
  invalidateTag(teamChatTag(input.teamId));
  return row;
}

/**
 * What a member may see: their team, visible rows, and — for SPOKEN lines only — nothing from
 * before they joined.
 *
 * The join floor deliberately does not apply to roster events. The room doubles as the team's
 * history, and a late joiner who could see no earlier joins or leaves would have no history at all.
 * Those events are also not private: who is on the team is already visible in the roster, so
 * hiding them protects nothing while breaking the feature. Conversation stays floored.
 */
function readableBy(membership: TeamMembershipRow) {
  const spokenSinceJoining = and(
    eq(teamChatMessages.kind, 'said'),
    gte(teamChatMessages.createdAt, membership.joinedAt),
  );
  return and(
    eq(teamChatMessages.teamId, membership.teamId),
    isNull(teamChatMessages.hiddenAt),
    or(spokenSinceJoining, ne(teamChatMessages.kind, 'said')),
  );
}

/**
 * Visible messages after `cursor`, oldest first — or the room's tail when there is no cursor,
 * because a phone opening the room wants the last thing said rather than the first.
 *
 * `id` is a UUIDv7, so a keyset comparison on the primary key is also a chronological one.
 */
export async function readTeamChatMessages(
  db: Executor,
  membership: TeamMembershipRow,
  cursor: string | null,
): Promise<readonly TeamChatMessageRow[]> {
  const mine = readableBy(membership);
  if (cursor) {
    return db
      .select()
      .from(teamChatMessages)
      .where(and(mine, gt(teamChatMessages.id, cursor)))
      .orderBy(asc(teamChatMessages.id))
      .limit(TEAM_CHAT_PAGE_LIMIT);
  }
  // ADR-087 — fifty on open, not two hundred. The rest is fetched only if somebody scrolls for it.
  const tail = await db
    .select()
    .from(teamChatMessages)
    .where(mine)
    .orderBy(sql`${teamChatMessages.id} desc`)
    .limit(TEAM_CHAT_TAIL_LIMIT);
  return [...tail].reverse();
}

/**
 * ADR-087 — the page of readable messages older than `before`, newest-first off the index and then
 * reversed, so a caller always receives oldest-first however it asked.
 *
 * Uncached, unlike the global room's equivalent, for the reason recorded at the top of this file: a
 * key would have to include both the team and the member's join time, so sixty teams would share
 * almost nothing and each entry would be invalidated about as often as it was read. The join floor
 * in `readableBy` still applies, so walking back cannot reach conversation from before the member
 * joined — the wall is the predicate, not the page size.
 */
export async function readOlderTeamChatMessages(
  db: Executor,
  membership: TeamMembershipRow,
  before: string,
): Promise<{ messages: readonly TeamChatMessageRow[]; hasOlder: boolean }> {
  const rows = await db
    .select()
    .from(teamChatMessages)
    .where(and(readableBy(membership), lt(teamChatMessages.id, before)))
    .orderBy(sql`${teamChatMessages.id} desc`)
    .limit(TEAM_CHAT_OLDER_LIMIT + 1);
  const page = pageOf(rows, TEAM_CHAT_OLDER_LIMIT);
  return { messages: [...page.rows].reverse(), hasOlder: page.hasOlder };
}

/**
 * ADR-155 — the captain's hide, and the two things it refuses.
 *
 * Scoped to the team in the WHERE clause, not merely checked beforehand: the message id comes
 * from the caller, and a captain of one team must not be able to reach into another's room by
 * guessing one. `kind = 'said'` is the second half of the same predicate — a roster line is the
 * team's record of what happened to it, and since ADR-154 it is the ONLY record of a staff
 * repair, so a captain may hide what was said and not what was done.
 *
 * `hidden_at IS NULL` makes a repeat hide a no-op that returns null rather than a second write,
 * which is what lets the route stay silent instead of announcing a retraction twice.
 */
export async function hideTeamChatMessage(
  db: Executor,
  input: { teamId: string; messageId: string },
): Promise<TeamChatMessageRow | null> {
  const row = firstOrNull(
    await db
      .update(teamChatMessages)
      .set({ hiddenAt: new Date() })
      .where(
        and(
          eq(teamChatMessages.id, input.messageId),
          eq(teamChatMessages.teamId, input.teamId),
          eq(teamChatMessages.kind, 'said'),
          isNull(teamChatMessages.hiddenAt),
        ),
      )
      .returning(),
  );
  // ADR-094 — the watermark this room shares must be recomputed, not served from the entry
  // the hidden line is still the newest of.
  if (row) invalidateTag(teamChatTag(input.teamId));
  return row;
}

/**
 * ADR-155 — does this id exist in this room at all, and is it a spoken line?
 *
 * Asked only when the hide changed nothing, so the route can tell a repeat (say nothing, 200)
 * from a wrong id (404) from an attempt on the team's history (409) without a second query on
 * the path that succeeds.
 */
export async function readTeamChatMessageKind(
  db: Executor,
  input: { teamId: string; messageId: string },
): Promise<TeamChatMessageKind | null> {
  const row = firstOrNull(
    await db
      .select({ kind: teamChatMessages.kind })
      .from(teamChatMessages)
      .where(
        and(eq(teamChatMessages.id, input.messageId), eq(teamChatMessages.teamId, input.teamId)),
      ),
  );
  return row?.kind ?? null;
}

/**
 * ADR-125 — when this team's room last changed, for every member of it at once.
 *
 * **The join floor is deliberately not applied here**, and that is the interesting part. The old
 * probe had to respect it, because "is there anything you have not read" starting from a null
 * marker would otherwise light a brand-new member's dot for a conversation that happened before
 * they arrived. The watermark cannot make that mistake: a device with no stored mark seeds
 * itself from the current value and shows dark (`feedReadStore.ts`), so the floor is enforced
 * where the reader is rather than in the query. Dropping it from the query is what collapses the
 * cache key from `team:marker:joinedAt` to just the team — one entry per room instead of one per
 * member.
 *
 * Hidden rows are still excluded: a moderated line must not keep a dot burning.
 */
async function latestTeamChatActivityFromDb(db: Executor, teamId: string): Promise<Date | null> {
  const row = firstOrNull(
    await db
      .select({ at: teamChatMessages.createdAt })
      .from(teamChatMessages)
      .where(and(eq(teamChatMessages.teamId, teamId), isNull(teamChatMessages.hiddenAt)))
      .orderBy(desc(teamChatMessages.id))
      .limit(1),
  );
  return row?.at ?? null;
}

/**
 * ADR-094 — one entry per room, voided by that room's own tag, so one busy team cannot wash
 * out the other fifty-nine.
 */
export const latestTeamChatActivity = cachedRead(latestTeamChatActivityFromDb, {
  name: 'teamChat.latestActivity',
  ttlMs: 10 * 60_000,
  tags: (teamId) => [teamChatTag(teamId)],
  key: (teamId) => teamId,
});

/**
 * ADR-063 — write the "joined" or "left" line that makes the room the team's history.
 *
 * The subject's nickname and title are read here rather than passed in, so no caller can record a
 * roster event without them and none has to know the room exists. The snapshot then behaves like
 * every other one in the schema: a later rename does not rewrite what the room saw.
 *
 * It does NOT publish to the bus. Publishing belongs after the enclosing transaction commits —
 * `createTeamWithCaptain` and `invalidateMembership` both do their work inside one, and a message
 * announced from a transaction that then rolled back would appear on every open phone and vanish
 * on the next reload.
 */
/**
 * Every kind except `said`: a roster event is the room's history rather than a line somebody
 * typed, which is also why the row carries no body (the schema's
 * `CHECK ((kind = 'said') = (body IS NOT NULL))` enforces that).
 */
export type RosterEventKind = Exclude<TeamChatMessageKind, 'said'>;

export async function recordRosterEvent(
  db: Executor,
  input: { teamId: string; participantId: string; kind: RosterEventKind },
): Promise<TeamChatMessageRow | null> {
  const subject = firstOrNull(
    await db
      .select({ nickname: participants.nickname, title: participants.title })
      .from(participants)
      .where(eq(participants.id, input.participantId)),
  );
  if (subject === null) return null;
  return createTeamChatMessage(db, {
    teamId: input.teamId,
    participantId: input.participantId,
    authorLabelSnapshot: subject.nickname,
    titleSnapshot: subject.title,
    kind: input.kind,
  });
}
