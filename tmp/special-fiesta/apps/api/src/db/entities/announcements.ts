import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { ANNOUNCEMENT_TAG, cachedRead, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { announcements } from '../schema/index.js';
import type { AnnouncementRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * Staff announcements (ADR-074).
 *
 * The live read is **identical for every participant**, because whether somebody has clicked a toast
 * away is kept in their own browser rather than here. That is what makes it worth caching: three
 * hundred phones polling their alerts share one entry, where a per-reader filter would have shared
 * nothing and been invalidated by its own reader's dismissal.
 *
 * Oldest first, because the toast shows one at a time: dismissing the oldest reveals the next, so
 * somebody who was away reads them in the order they were made rather than backwards.
 */

export interface NewAnnouncement {
  superadminId: string;
  authorLabelSnapshot: string;
  body: string;
}

const ANNOUNCEMENT_CACHE_TTL_MS = 5_000;

export async function createAnnouncement(
  db: Executor,
  input: NewAnnouncement,
): Promise<AnnouncementRow> {
  const row = firstOrThrow(
    await db
      .insert(announcements)
      .values({ id: newId(), ...input })
      .returning(),
    'Announcement insert returned no row',
  );
  invalidateTag(ANNOUNCEMENT_TAG);
  return row;
}

async function readLive(db: Executor): Promise<readonly AnnouncementRow[]> {
  return db
    .select()
    .from(announcements)
    .where(isNull(announcements.retractedAt))
    .orderBy(asc(announcements.id));
}

/**
 * ADR-038's shape: a hot read wrapped once and invalidated by the writes that change it. Every
 * participant's alerts poll lands on the same key, so an announcement costs about one query per TTL
 * window across the whole event rather than one per phone.
 */
export const readLiveAnnouncements = cachedRead(readLive, {
  name: 'announcements.live',
  ttlMs: ANNOUNCEMENT_CACHE_TTL_MS,
  tags: [ANNOUNCEMENT_TAG],
  key: () => 'live',
});

/** Every announcement, newest first, so the console shows what has been said and what is retracted. */
export async function listAnnouncements(db: Executor): Promise<readonly AnnouncementRow[]> {
  return db.select().from(announcements).orderBy(sql`${announcements.id} desc`).limit(50);
}

/** Retracting is a soft hide, never a delete: the row stays for the audit trail. */
export async function invalidateAnnouncement(
  db: Executor,
  announcementId: string,
): Promise<AnnouncementRow | null> {
  const row = firstOrNull(
    await db
      .update(announcements)
      .set({ retractedAt: new Date() })
      .where(and(eq(announcements.id, announcementId), isNull(announcements.retractedAt)))
      .returning(),
  );
  if (row) invalidateTag(ANNOUNCEMENT_TAG);
  return row;
}
