import type { ClusterCode, GallerySort } from '@psd/contracts';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AppDatabase, Executor } from '../client.js';
import { GALLERY_TAG, cachedRead, invalidateTag } from '../../lib/cache.js';
import { newId } from '../ids.js';
import { galleryPhotos, galleryReports, galleryVotes } from '../schema/index.js';
import type { GalleryPhotoRow } from '../schema/index.js';
import { firstOrNull, firstOrThrow } from '../rows.js';

/**
 * Gallery metadata reads and writes (ADR-047). No function here ever touches image bytes —
 * that is `lib/galleryStore.ts`, and keeping the two apart is what makes a listing physically
 * unable to read a gigabyte of photos.
 *
 * Every read names its columns. A bare `select()` on a growing table is how a listing quietly
 * becomes a scan, and the vote count is a subquery rather than a join so one photo with four
 * hundred likes cannot multiply its own row.
 */

const GALLERY_PAGE_LIMIT = 60;
const GALLERY_CACHE_TTL_MS = 5_000;

export interface NewGalleryPhoto {
  uploaderType: 'participant' | 'facilitator';
  participantId: string | null;
  facilitatorId: string | null;
  uploaderLabelSnapshot: string;
  clusterCodeSnapshot: ClusterCode | null;
  caption: string;
  width: number;
  height: number;
  bytes: number;
  /** ADR-050 — the archival original's identity. */
  originalFilename: string;
  sha1Raw: string;
  rawByteSize: number;
  rawIsOriginal: boolean;
}

/**
 * The row plus the one derived number a surface needs, and nothing else.
 *
 * ADR-134 — `hasMyVote` used to live here. It was the only per-viewer field on an otherwise
 * identical list, and carrying it meant the whole page had to be cached per viewer. Whether
 * *you* liked a photo is now `readMyVoteIds`, folded in by the client.
 */
export interface GalleryPhotoRecord extends GalleryPhotoRow {
  voteCount: number;
}

export async function createGalleryPhoto(
  db: Executor,
  input: NewGalleryPhoto,
): Promise<GalleryPhotoRow> {
  const row = firstOrThrow(
    await db
      .insert(galleryPhotos)
      .values({ id: newId(), ...input })
      .returning(),
    'Gallery photo insert returned no row',
  );
  invalidateTag(GALLERY_TAG);
  return row;
}

/** ADR-324 — a participant's quota is full; the route turns this into a 409 with the existing copy. */
export class GalleryQuotaError extends Error {
  constructor() {
    super('gallery quota reached');
    this.name = 'GalleryQuotaError';
  }
}

/**
 * ADR-324 — create a photo only if its uploader still has room, as one step.
 *
 * The route used to count, then (many awaits later) insert, so N parallel uploads each saw "room
 * for one more" and all went in. The count and the insert now share a transaction behind an
 * advisory lock keyed on the uploader, so the second upload waits for the first to finish and then
 * counts it. And the count includes hidden photos: hiding is moderation, not deletion — the bytes
 * are still stored — so a hidden photo must not hand its uploader a fresh allowance.
 *
 * A facilitator has no cap (`participantId` is null), only the gallery-wide ceiling.
 */
export async function createGalleryPhotoWithinQuota(
  db: AppDatabase,
  input: { photo: NewGalleryPhoto; limit: number },
): Promise<GalleryPhotoRow> {
  const row = await db.transaction(async (tx) => {
    const owner = input.photo.participantId;
    if (owner) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'gallery-quota:' + owner}))`);
      const used = await countAllPhotosByParticipant(tx, owner);
      if (used >= input.limit) throw new GalleryQuotaError();
    }
    return firstOrThrow(
      await tx.insert(galleryPhotos).values({ id: newId(), ...input.photo }).returning(),
      'Gallery photo insert returned no row',
    );
  });
  invalidateTag(GALLERY_TAG);
  return row;
}

/** Everything the uploader ever stored, hidden or not. */
async function countAllPhotosByParticipant(db: Executor, participantId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(galleryPhotos)
    .where(eq(galleryPhotos.participantId, participantId));
  return firstOrNull(rows)?.total ?? 0;
}

/** The uploader's own cap, counted over visible photos only. */
export async function countPhotosByParticipant(
  db: Executor,
  participantId: string,
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(galleryPhotos)
    .where(and(eq(galleryPhotos.participantId, participantId), isNull(galleryPhotos.hiddenAt)));
  return firstOrNull(rows)?.total ?? 0;
}

/**
 * How many likes each photo has, as one small indexed aggregate rather than a correlated
 * subquery in the listing's SELECT.
 *
 * That is deliberate: a subquery per row is easy to write and easy to get subtly wrong, and a
 * `GROUP BY` over a partial-indexed column is both predictable and cheap. One extra round trip
 * against an in-process database costs far less than a listing whose counts are silently zero.
 *
 * ADR-134 — this is a fact about the event, identical for everybody looking at the wall, which
 * is why it belongs in the cached page and `readMyVoteIds` does not.
 */
async function tallyVotes(db: Executor): Promise<Map<string, number>> {
  const counted = await db
    .select({ photoId: galleryVotes.photoId, total: sql<number>`count(*)::int` })
    .from(galleryVotes)
    .where(isNull(galleryVotes.expiresAt))
    .groupBy(galleryVotes.photoId);
  return new Map(counted.map((row) => [row.photoId, Number(row.total)]));
}

/**
 * ADR-134 — the per-viewer overlay: which photos this participant has an active vote on.
 *
 * Deliberately **not** cached, and that is the point of the change rather than an oversight.
 * It is a single index scan returning a handful of ids; a per-viewer cache entry would be
 * three hundred entries that every like anywhere in the event voids through `GALLERY_TAG`,
 * which is a worse hit rate than the query it replaces and three hundred times the memory.
 * Cache what the room shares; read what belongs to one person.
 */
export async function readMyVoteIds(
  db: Executor,
  viewerId: string | null,
): Promise<readonly string[]> {
  if (viewerId === null) return [];
  const rows = await db
    .select({ photoId: galleryVotes.photoId })
    .from(galleryVotes)
    .where(and(eq(galleryVotes.participantId, viewerId), isNull(galleryVotes.expiresAt)));
  return rows.map((row) => row.photoId);
}

async function readPhotoPage(
  db: Executor,
  sort: GallerySort,
): Promise<readonly GalleryPhotoRecord[]> {
  const rows = await db
    .select()
    .from(galleryPhotos)
    .where(isNull(galleryPhotos.hiddenAt))
    // Ids are UUIDv7, so descending by id is newest-first without touching `created_at`.
    .orderBy(desc(galleryPhotos.id))
    .limit(GALLERY_PAGE_LIMIT);

  const counts = await tallyVotes(db);
  const withVotes = rows.map((row) => ({ ...row, voteCount: counts.get(row.id) ?? 0 }));

  // "Top" sorts in memory over one bounded page. Ties break by recency, so the wall keeps
  // moving rather than freezing on whichever photo got popular first.
  if (sort !== 'top') return withVotes;
  return [...withVotes].sort(
    (left, right) => right.voteCount - left.voteCount || right.id.localeCompare(left.id),
  );
}

/**
 * ADR-038's shape, tagged so a vote, an un-vote or a hide voids the counts it changed.
 *
 * ADR-134 — keyed on the sort ALONE. It used to be `${sort}:${viewerId}`, which meant three
 * hundred phones on the photo wall were three hundred copies of the same sixty rows, each
 * paying three selects to build and each voided by every like anywhere in the event. Two
 * entries now serve the whole room.
 */
export const readGalleryPage = cachedRead(readPhotoPage, {
  name: 'gallery.page',
  ttlMs: GALLERY_CACHE_TTL_MS,
  tags: [GALLERY_TAG],
  key: (sort) => sort,
});

export interface GalleryModerationRecord extends GalleryPhotoRecord {
  reportCount: number;
}

/**
 * Everything a superadmin needs to moderate, including what is already hidden — an unhide is
 * impossible if hidden rows cannot be seen. Not cached: a moderator acting on a report needs the
 * current truth, and there is exactly one of them.
 */
export async function listPhotosForModeration(
  db: Executor,
): Promise<readonly GalleryModerationRecord[]> {
  const rows = await db.select().from(galleryPhotos).orderBy(desc(galleryPhotos.id)).limit(200);

  const reported = await db
    .select({ photoId: galleryReports.photoId, total: sql<number>`count(*)::int` })
    .from(galleryReports)
    .groupBy(galleryReports.photoId);
  const reports = new Map(reported.map((row) => [row.photoId, Number(row.total)]));

  const counts = await tallyVotes(db);
  const enriched = rows.map((row) => ({
    ...row,
    voteCount: counts.get(row.id) ?? 0,
    reportCount: reports.get(row.id) ?? 0,
  }));

  // Reported photos first: the console should open on what needs a decision.
  return [...enriched].sort(
    (left, right) => right.reportCount - left.reportCount || right.id.localeCompare(left.id),
  );
}

/**
 * Reversing a hide, because moderation that cannot be undone is a decision nobody wants to make.
 *
 * ADR-125 — `visible_since` moves to now as well. A restored photo is new to everyone who never
 * saw it, so it has to light the gallery LED; left on its original creation time it would slide
 * silently back into the grid.
 */
export async function restoreGalleryPhoto(
  db: Executor,
  photoId: string,
): Promise<GalleryPhotoRow | null> {
  const row = firstOrNull(
    await db
      .update(galleryPhotos)
      .set({ hiddenAt: null, visibleSince: new Date() })
      .where(eq(galleryPhotos.id, photoId))
      .returning(),
  );
  if (row) invalidateTag(GALLERY_TAG);
  return row;
}

/**
 * ADR-125 — when the gallery last gained something to look at.
 *
 * Over `visible_since` rather than `created_at`, so a restore counts and an upload backlog that
 * lands late still counts from when it landed. Votes and reports deliberately do not move it: the
 * dot means "there is a new photo", and somebody liking an old one is not that.
 *
 * A hide lowers the watermark instead of raising it, which is the right direction — removing a
 * photo must never be the thing that summons three hundred people to look at the wall.
 */
async function latestGalleryActivityFromDb(db: Executor): Promise<Date | null> {
  const row = firstOrNull(
    await db
      .select({ at: galleryPhotos.visibleSince })
      .from(galleryPhotos)
      .where(isNull(galleryPhotos.hiddenAt))
      .orderBy(desc(galleryPhotos.visibleSince))
      .limit(1),
  );
  return row?.at ?? null;
}

/** ADR-094 — one entry for the whole event, voided by every upload, hide and restore. */
export const latestGalleryActivity = cachedRead(latestGalleryActivityFromDb, {
  name: 'gallery.latestActivity',
  ttlMs: 10 * 60_000,
  tags: [GALLERY_TAG],
});

/**
 * ADR-050 — has this exact file been shared already?
 *
 * Keyed on the SHA-1 of the RAW bytes, computed server-side: a hash the client supplies proves
 * nothing, and the point is to stop 12 MB being stored twice. The check spans hidden photos too,
 * because a hidden duplicate still occupies the space this exists to protect.
 */
export async function findPhotoBySha1(
  db: Executor,
  sha1Raw: string,
): Promise<GalleryPhotoRow | null> {
  return firstOrNull(
    await db.select().from(galleryPhotos).where(eq(galleryPhotos.sha1Raw, sha1Raw)).limit(1),
  );
}

export async function findGalleryPhotoById(
  db: Executor,
  photoId: string,
): Promise<GalleryPhotoRow | null> {
  return firstOrNull(await db.select().from(galleryPhotos).where(eq(galleryPhotos.id, photoId)));
}

async function findActiveVote(
  db: Executor,
  photoId: string,
  participantId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: galleryVotes.id })
    .from(galleryVotes)
    .where(
      and(
        eq(galleryVotes.photoId, photoId),
        eq(galleryVotes.participantId, participantId),
        isNull(galleryVotes.expiresAt),
      ),
    );
  return firstOrNull(rows)?.id ?? null;
}

/**
 * A like is idempotent: the partial unique index means a second tap cannot create a second
 * active row, so this reads first and only inserts when there is nothing active to keep.
 */
export async function castVote(db: Executor, photoId: string, participantId: string): Promise<void> {
  if (await findActiveVote(db, photoId, participantId)) return;
  await db.insert(galleryVotes).values({ id: newId(), photoId, participantId });
  invalidateTag(GALLERY_TAG);
}

/** Un-voting invalidates; `delete` is not a thing this repository does. */
export async function invalidateVote(
  db: Executor,
  photoId: string,
  participantId: string,
): Promise<void> {
  await db
    .update(galleryVotes)
    .set({ expiresAt: new Date() })
    .where(
      and(
        eq(galleryVotes.photoId, photoId),
        eq(galleryVotes.participantId, participantId),
        isNull(galleryVotes.expiresAt),
      ),
    );
  invalidateTag(GALLERY_TAG);
}

/** Returns false when this person already reported this photo; the unique index is the rule. */
export async function reportPhoto(
  db: Executor,
  photoId: string,
  participantId: string,
): Promise<boolean> {
  const inserted = await db
    .insert(galleryReports)
    .values({ id: newId(), photoId, participantId })
    .onConflictDoNothing()
    .returning();
  return firstOrNull(inserted) !== null;
}

export async function invalidateGalleryPhoto(
  db: Executor,
  photoId: string,
): Promise<GalleryPhotoRow | null> {
  const row = firstOrNull(
    await db
      .update(galleryPhotos)
      .set({ hiddenAt: new Date() })
      .where(and(eq(galleryPhotos.id, photoId), isNull(galleryPhotos.hiddenAt)))
      .returning(),
  );
  if (row) invalidateTag(GALLERY_TAG);
  return row;
}
