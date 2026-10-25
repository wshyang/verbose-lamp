import { randomInt } from 'node:crypto';
import { avatarSpriteId } from '@psd/contracts';
import type { ParticipantIdentityView } from '@psd/contracts';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import {
  SCOREBOARD_TAG,
  forgetMissingSprites,
  forgetSpriteBody,
  MISSING,
  missingSpriteIds,
  invalidateTag,
  rememberSpriteBody,
  scopeOf,
  spriteBodies,
  spriteEpochNow,
} from '../../lib/cache.js';
import { newId } from '../ids.js';
import { participants, teamMemberships, teams } from '../schema/index.js';
import type { ParticipantRow } from '../schema/index.js';
import { randomParticipantTitle } from '../../lib/titles.js';
import { firstOrDefault, firstOrNull, firstOrThrow } from '../rows.js';
import { uniqueViolationOf } from '../violations.js';

/** fds.md §2.1 #obj-participant. */

export interface NewParticipant {
  nickname: string;
  pin: string;
  clusterCode: string;
  gender: 'male' | 'female';
  avatarVariant: number;
  avatarLook: string;
  avatarPhoto?: string | null | undefined;
  /**
   * ADR-061 — normally left out and picked at random here, so no caller can create a participant
   * without one. Supplied only where a test needs a predictable word.
   */
  title?: string;
}

/**
 * ADR-088 — a fresh 4-digit scan number. `crypto.randomInt` is rejection-sampled (no modulo
 * bias), and the zero-padded STRING is the value: "0042" survives every boundary an integer
 * would shed its zeros at.
 */
function mintScanNumber(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/**
 * At most-crowded (300 heads in a 10,000 number space) a mint collides with p <= 0.03, so five
 * straight collisions is ~2.4e-8 — not a code path, an assertion. The cap exists so a LOGIC bug
 * (every insert "colliding") dies loudly after five tries instead of looping forever.
 */
const SCAN_NUMBER_ATTEMPTS = 5;

export async function createParticipant(
  db: Executor,
  input: NewParticipant,
  mint: () => string = mintScanNumber,
): Promise<ParticipantRow> {
  // The title is minted here for the same reason the id is: it is part of what a participant
  // IS, and a route that forgot it would be a NOT NULL violation at best and an untitled
  // participant at worst. `input.title` wins when a caller has a reason to be specific.
  const title = input.title ?? randomParticipantTitle();
  for (let attempt = 1; ; attempt += 1) {
    try {
      /*
       * ADR-088 — the scan number rides the participant INSERT itself, so "number reserved" and
       * "participant exists" are the same atomic write: the unique index arbitrates every race,
       * and there is no multi-statement window to protect. A fresh mint per attempt, never
       * increment-from-collision — that would smuggle sequential order back in.
       */
      const row = firstOrThrow(await db
        .insert(participants)
        .values({ id: newId(), ...input, title, scanNumber: mint() })
        .returning(), 'Participant insert returned no row');
      // ADR-038 — cluster standings count heads, so a signup changes them.
      invalidateTag(SCOREBOARD_TAG);
      // ADR-324 — a signup can carry a photo; any id remembered as missing may exist now.
      if (row.avatarPhoto !== null) forgetMissingSprites();
      return row;
    } catch (error) {
      const isNumberCollision = uniqueViolationOf(error) === 'ux_participant_scan_number';
      if (!isNumberCollision || attempt >= SCAN_NUMBER_ATTEMPTS) throw error;
    }
  }
}

/** ADR-088 — the manual-entry lookup: exactly one participant owns any scan number. */
export async function findParticipantByScanNumber(
  db: Executor,
  scanNumber: string,
): Promise<ParticipantRow | null> {
  return firstOrNull(await db
    .select()
    .from(participants)
    .where(eq(participants.scanNumber, scanNumber)));
}

export async function findParticipantById(
  db: Executor,
  participantId: string,
): Promise<ParticipantRow | null> {
  return firstOrNull(await db.select().from(participants).where(eq(participants.id, participantId)));
}

/** fds.md §4.2.9 — nickname uniqueness and lookup are case-insensitive. */
export async function findParticipantByNickname(
  db: Executor,
  nickname: string,
): Promise<ParticipantRow | null> {
  return firstOrNull(await db
    .select()
    .from(participants)
    .where(eq(sql`lower(${participants.nickname})`, nickname.toLowerCase())));
}

/**
 * ADR-082 — presence lands in one statement per flush interval, not one per request. The
 * caller (lib/presence.ts) batches ids in memory; an empty interval costs no query at all.
 */
export async function touchParticipantsSeen(db: Executor, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(participants)
    .set({ lastSeenAt: new Date() })
    .where(inArray(participants.id, [...ids]));
}

/** S33/S56 — facilitator and superadmin PIN reset paths both land here. */
export async function resetParticipantPin(
  db: Executor,
  input: { participantId: string; pin: string },
): Promise<ParticipantRow | null> {
  return firstOrNull(await db
    .update(participants)
    .set({ pin: input.pin })
    .where(eq(participants.id, input.participantId))
    .returning());
}

export interface ParticipantWithTeam extends ParticipantRow {
  teamId: string | null;
  teamName: string | null;
}

/**
 * S4 — the participant redraws their own avatar (ADR-021).
 *
 * ADR-228 — `avatarPhoto` is three-valued, as it is in the studio's draft (ADR-059). A sprite replaces the
 * photo, `null` takes it off, and an omitted key keeps whatever is worn. Omitting it used to take the photo
 * off (`?? null`), so a request that did not mention the photo quietly removed it (N5).
 *
 * The photo being replaced or taken off is forgotten by this process's sprite cache once the save has
 * committed. It is read under a row lock in the same transaction, so the face taken off is the one the row
 * actually held, even if another save of the same participant ran at the same moment.
 */
export async function updateParticipantAvatar(
  db: Executor,
  input: {
    participantId: string;
    avatarVariant: number;
    avatarLook: string;
    avatarPhoto?: string | null | undefined;
  },
): Promise<ParticipantRow | null> {
  const { row, previous } = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ avatarPhoto: participants.avatarPhoto })
      .from(participants)
      .where(eq(participants.id, input.participantId))
      .for('update');
    const updated = firstOrNull(await tx
      .update(participants)
      .set({
        avatarVariant: input.avatarVariant,
        avatarLook: input.avatarLook,
        ...(input.avatarPhoto === undefined ? {} : { avatarPhoto: input.avatarPhoto }),
      })
      .where(eq(participants.id, input.participantId))
      .returning());
    return { row: updated, previous: current?.avatarPhoto ?? null };
  });
  // ADR-038 — the top-ten rows carry the avatar, so a redraw must show next poll.
  if (row !== null) invalidateTag(SCOREBOARD_TAG);
  // ADR-324 — a saved photo is the only thing that can make a remembered-missing id exist.
  if (row !== null) forgetMissingSprites();
  // ADR-228 — a face that was replaced or taken off is forgotten only after the save has committed.
  if (row !== null && previous !== null && previous !== row.avatarPhoto) {
    forgetSpriteBody(scopeOf(db), avatarSpriteId(previous));
  }
  return row;
}

/**
 * ADR-148 — one search box, two identifiers, no mode switch.
 *
 * ADR-088 gave every participant a 4-digit `scan_number` *because* it is the identifier that
 * survives being read out across a noisy marquee, and banned all-digit nicknames so the two
 * channels could never be confused. That ban is what makes this unambiguous: **a query that
 * is all digits can only be a number being spoken**, so there is nothing for an operator to
 * choose between and no second field to put on the page.
 *
 * Matched as a **prefix**, not an equality, so a half-heard number still narrows the list —
 * "four-eight-something" is the normal case at a help desk, not the exception.
 *
 * The nickname match is kept as well rather than replaced. Nicknames may *contain* digits
 * (`Marcus2` is legal; `2` alone is not), so dropping it would make a digit query silently
 * lose rows it used to find.
 */
function matchesSearch(search: string) {
  const nickname = sql`lower(${participants.nickname}) LIKE ${`%${search.toLowerCase()}%`}`;
  if (!/^[0-9]+$/.test(search)) return nickname;
  return or(sql`${participants.scanNumber} LIKE ${`${search}%`}`, nickname);
}

/** S53 — superadmin participant list, filtered by nickname, scan number or cluster. */
export async function listParticipants(
  db: Executor,
  filters: { search?: string | undefined; clusterCode?: string | undefined } = {},
): Promise<ParticipantWithTeam[]> {
  const search = filters.search?.trim();
  const conditions = [
    search !== undefined && search !== '' ? matchesSearch(search) : undefined,
    filters.clusterCode ? eq(participants.clusterCode, filters.clusterCode) : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: participants.id,
      nickname: participants.nickname,
      pin: participants.pin,
      clusterCode: participants.clusterCode,
      gender: participants.gender,
      avatarVariant: participants.avatarVariant,
      avatarPhoto: participants.avatarPhoto,
      avatarLook: participants.avatarLook,
      title: participants.title,
      scanNumber: participants.scanNumber,
      createdAt: participants.createdAt,
      lastSeenAt: participants.lastSeenAt,
      teamId: teams.id,
      teamName: teams.teamName,
    })
    .from(participants)
    .leftJoin(
      teamMemberships,
      and(eq(teamMemberships.participantId, participants.id), isNull(teamMemberships.expiresAt)),
    )
    .leftJoin(teams, eq(teams.id, teamMemberships.teamId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(sql`lower(${participants.nickname})`));
}

/**
 * ADR-164 — every nickname in one cluster, for the participant who has forgotten theirs.
 *
 * Nicknames only. Not the scan number, not the id, not the avatar, not the PIN: the caller is
 * anonymous by design — somebody who cannot sign in is the only person who needs this — so the
 * answer carries the one field that is already public on every leaderboard and in every chat
 * room, and nothing that could be used to impersonate the person it names.
 *
 * Narrowed by cluster because that is the thing a participant always still knows about
 * themselves, and because it turns a list of several hundred into one of a few dozen that can
 * be read down a phone screen. Ordered case-insensitively, like the directory, so the eye can
 * run down it.
 */
export async function listNicknamesInCluster(db: Executor, clusterCode: string): Promise<string[]> {
  const rows = await db
    .select({ nickname: participants.nickname })
    .from(participants)
    .where(eq(participants.clusterCode, clusterCode))
    .orderBy(asc(sql`lower(${participants.nickname})`));
  return rows.map((row) => row.nickname);
}

export async function countParticipants(db: Executor): Promise<number> {
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(participants);
  return firstOrDefault(rows, { total: 0 }).total;
}

/**
 * ADR-035 — the sprite bodies behind a set of ids. The id is a hash of the sprite, so
 * this is a content-addressed read: whatever comes back is what was asked for, and a
 * browser only ever asks once.
 */
/** Files the ids the scan could not find, unless a face changed while it ran (the same epoch rule as bodies). */
function rememberMissing(input: { scope: number; wanted: ReadonlySet<string>; found: ReadonlyMap<string, string>; epoch: number }): void {
  if (input.epoch !== spriteEpochNow()) return;
  for (const id of input.wanted) {
    if (!input.found.has(id)) missingSpriteIds.set(`${input.scope}:${id}`, MISSING);
  }
}

export async function listAvatarSprites(db: Executor, ids: string[]): Promise<Map<string, string>> {
  // ADR-038 — a sprite id is a hash of the sprite, so a cached body can never be stale;
  // the table is only visited for ids this process has not resolved before.
  const scope = scopeOf(db);
  const found = new Map<string, string>();
  const missing = new Set<string>();
  for (const id of ids) {
    const cached = spriteBodies.get(`${scope}:${id}`);
    if (cached !== undefined) found.set(id, cached);
    // ADR-324 — an id a full scan already failed to find costs nothing to say "not found" about again.
    else if (!missingSpriteIds.has(`${scope}:${id}`)) missing.add(id);
  }
  if (missing.size === 0) return found;

  // ADR-228 — taken before the query: a face taken off while the scan runs is not written back.
  const epoch = spriteEpochNow();
  const rows = await db
    .select({ avatarPhoto: participants.avatarPhoto })
    .from(participants)
    .where(isNotNull(participants.avatarPhoto));
  for (const row of rows) {
    const sprite = row.avatarPhoto;
    if (sprite === null) continue;
    const id = avatarSpriteId(sprite);
    // Everything the scan surfaced is worth keeping — the next batch will ask for it.
    rememberSpriteBody({ scope, id, sprite, epoch });
    if (missing.has(id)) found.set(id, sprite);
  }
  rememberMissing({ scope, wanted: missing, found, epoch });
  return found;
}

/**
 * ADR-202 — who a set of participant ids are, for a surface that only holds ids.
 *
 * A chat room has carried `authorParticipantId` since ADR-046, on the stated grounds that a
 * face resolves client-side rather than riding along on every message. This is the other half
 * of that sentence: forty people talking three hundred times is forty rows, asked for once.
 *
 * Read live on purpose. The row beside it froze the nickname and the cluster so that the
 * record of what was said cannot be rewritten; an avatar was never part of what was said, and
 * a person who restyled themselves at lunch should not be two different people in one scroll.
 */
export async function listParticipantIdentities(
  db: Executor,
  ids: readonly string[],
): Promise<ParticipantIdentityView[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      participantId: participants.id,
      nickname: participants.nickname,
      clusterCode: participants.clusterCode,
      gender: participants.gender,
      avatarVariant: participants.avatarVariant,
      avatarLook: participants.avatarLook,
      avatarPhoto: participants.avatarPhoto,
      title: participants.title,
    })
    .from(participants)
    .where(inArray(participants.id, [...ids]));
  return rows.map((row) => ({
    participantId: row.participantId,
    nickname: row.nickname,
    clusterCode: row.clusterCode,
    gender: row.gender,
    avatarVariant: row.avatarVariant,
    avatarLook: row.avatarLook,
    // The same indirection every other surface uses: the id of the body, never the body.
    avatarPhotoId: row.avatarPhoto === null ? null : avatarSpriteId(row.avatarPhoto),
    title: row.title,
  }));
}
