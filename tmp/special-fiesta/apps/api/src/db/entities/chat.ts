import type { ClusterCode } from '@psd/contracts';
import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { CHAT_TAG, cachedRead, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { chatMessages } from '../schema/index.js';
import type { ChatMessageRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * Chat room reads and writes (ADR-046).
 *
 * The cost model is the whole point: sending is one INSERT and no reads, because a sent
 * message reaches open streams through the in-process bus rather than by anyone polling for
 * it. The only read is the catch-up delta, and it is cached, so three hundred phones
 * reconnecting after a Wi-Fi blip collapse to roughly one query per TTL window.
 */

/** Serve a bounded window on catch-up; a room's scrollback is not an archive. */
export const CHAT_PAGE_LIMIT = 200;

/**
 * ADR-065 — how much of the room a phone is handed at once.
 *
 * Opening on fifty rather than two hundred is the cheap end of "do not blow the database up": it is
 * four times less to serialise, parse and lay out on the one page every participant visits, and a
 * room is read from the bottom anyway — nobody arrives wanting the two-hundredth message back. The
 * rest is fetched only if somebody actually scrolls for it.
 */
export const CHAT_TAIL_LIMIT = 50;
export const CHAT_OLDER_LIMIT = 50;

/**
 * One row past the limit is read and then dropped, so `hasOlder` is a fact rather than the usual
 * "we returned a full page, so there is probably more" guess that makes a list flicker an extra
 * empty fetch at the end of history.
 */
function pageOf(rows: readonly ChatMessageRow[], limit: number) {
  const hasOlder = rows.length > limit;
  return { rows: rows.slice(0, limit), hasOlder };
}

const CHAT_CACHE_TTL_MS = 2_000;

export interface NewChatMessage {
  authorType: 'participant' | 'facilitator' | 'superadmin';
  participantId: string | null;
  facilitatorId: string | null;
  superadminId: string | null;
  authorLabelSnapshot: string;
  clusterCodeSnapshot: ClusterCode | null;
  body: string;
}

export async function createChatMessage(
  db: Executor,
  input: NewChatMessage,
): Promise<ChatMessageRow> {
  const row = firstOrThrow(
    await db
      .insert(chatMessages)
      .values({ id: newId(), ...input })
      .returning(),
    'Chat message insert returned no row',
  );
  invalidateTag(CHAT_TAG);
  return row;
}

/**
 * Visible messages after `cursor`, oldest first. `id` is a UUIDv7, so a keyset comparison on
 * the primary key is also a chronological one — no `created_at` sort and no second index.
 * Passing no cursor returns the tail of the room rather than its beginning, because a phone
 * opening chat wants the last thing said, not the first.
 */
async function readMessagesAfter(
  db: Executor,
  cursor: string | null,
): Promise<readonly ChatMessageRow[]> {
  const visible = isNull(chatMessages.hiddenAt);
  if (cursor) {
    return db
      .select()
      .from(chatMessages)
      .where(and(visible, gt(chatMessages.id, cursor)))
      .orderBy(asc(chatMessages.id))
      .limit(CHAT_PAGE_LIMIT);
  }
  const tail = await db
    .select()
    .from(chatMessages)
    .where(visible)
    .orderBy(sql`${chatMessages.id} desc`)
    .limit(CHAT_TAIL_LIMIT);
  return [...tail].reverse();
}

/**
 * ADR-065 — the page of messages OLDER than `before`, for scrolling back up.
 *
 * Read newest-first from the cursor and reversed, which is what lets the partial index do the work:
 * `ix_chat_message_visible` is on `(id)`, so this is a backwards index scan stopping after fifty-one
 * rows rather than a sort of the whole room.
 */
async function readOlderThan(db: Executor, before: string) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(isNull(chatMessages.hiddenAt), lt(chatMessages.id, before)))
    .orderBy(sql`${chatMessages.id} desc`)
    .limit(CHAT_OLDER_LIMIT + 1);
  const page = pageOf(rows, CHAT_OLDER_LIMIT);
  return { messages: [...page.rows].reverse(), hasOlder: page.hasOlder };
}

/**
 * Cached on the same terms as the tail read. Older pages are the most cacheable thing in the room —
 * history only changes when a message is hidden, which invalidates `CHAT_TAG` anyway — and three
 * hundred phones scrolling back through the same conversation share every key.
 */
export const readOlderMessages = cachedRead(readOlderThan, {
  name: 'chat.older',
  ttlMs: CHAT_CACHE_TTL_MS,
  tags: [CHAT_TAG],
  key: (before) => `before:${before}`,
});

/**
 * ADR-038's shape: a hot read wrapped once, invalidated by the write that changes it. The TTL
 * is short because chat is the one surface where two seconds of staleness is noticeable, and
 * it only has to survive a reconnect stampede rather than a poll cadence.
 */
export const readVisibleMessages = cachedRead(readMessagesAfter, {
  name: 'chat.messages',
  ttlMs: CHAT_CACHE_TTL_MS,
  tags: [CHAT_TAG],
  key: (cursor) => cursor ?? 'tail',
});

/**
 * Moderation is a soft hide, never a delete (AGENTS-database.md §4): the row stays for the
 * audit trail and drops out of every read through the partial index's predicate.
 */
export async function invalidateChatMessage(
  db: Executor,
  messageId: string,
): Promise<ChatMessageRow | null> {
  const row = firstOrNull(
    await db
      .update(chatMessages)
      .set({ hiddenAt: new Date() })
      .where(and(eq(chatMessages.id, messageId), isNull(chatMessages.hiddenAt)))
      .returning(),
  );
  if (row) invalidateTag(CHAT_TAG);
  return row;
}

/**
 * ADR-125 — when the global room last changed, for every reader at once.
 *
 * This replaced a per-reader `EXISTS` probe, and the shape of the saving is the point: the old
 * question was "is there anything after *your* marker", so its cache key was the reader's
 * marker and a wave of reconnects asked it once per distinct position. This question has no
 * reader in it, so the whole event shares one entry.
 *
 * Only visible messages, exactly as the probe was: a moderated-away line must not keep a dot
 * burning. Hiding the newest message therefore *lowers* the watermark, which is correct — the
 * dot it lit goes out on the next snapshot.
 *
 * Newest BY ID rather than by time, then its timestamp: ids are UUIDv7, so the two orders are
 * the same one, and `ix_chat_message_visible` is an index on exactly `(id) WHERE hidden_at IS
 * NULL`. An aggregate over `created_at` would read every visible row to find a value the index
 * can hand over from its own edge — and it would come back as a driver string rather than
 * through Drizzle's column mapping, which is a second, quieter reason not to.
 */
async function latestChatActivityFromDb(db: Executor): Promise<Date | null> {
  const row = firstOrNull(
    await db
      .select({ at: chatMessages.createdAt })
      .from(chatMessages)
      .where(isNull(chatMessages.hiddenAt))
      .orderBy(desc(chatMessages.id))
      .limit(1),
  );
  return row?.at ?? null;
}

/**
 * ADR-094 — one entry for the whole event, voided by every send and every hide. The TTL is the
 * module doc's safety net; the tag is the freshness.
 */
export const latestChatActivity = cachedRead(latestChatActivityFromDb, {
  name: 'chat.latestActivity',
  ttlMs: 10 * 60_000,
  tags: [CHAT_TAG],
});
