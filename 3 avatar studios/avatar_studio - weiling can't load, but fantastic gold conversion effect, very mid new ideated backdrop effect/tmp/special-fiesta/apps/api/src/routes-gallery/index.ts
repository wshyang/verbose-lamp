import { Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  GALLERY_PHOTOS_PER_UPLOADER,
  GALLERY_RAW_MAX_BYTES,
  GALLERY_RENDITION_MAX_BYTES,
  galleryRenditionSchema,
  gallerySortSchema,
  messages,
} from '@psd/contracts';
import {
  castVote,
  countPhotosByParticipant,
  GalleryQuotaError,
  createGalleryPhotoWithinQuota,
  type NewGalleryPhoto,
  totalBlobBytes,
  findGalleryBlob,
  findGalleryPhotoById,
  invalidateGalleryPhoto,
  invalidateVote,
  latestGalleryActivity,
  listPhotosForModeration,
  readGalleryPage,
  readMyVoteIds,
  reportPhoto,
  restoreGalleryPhoto,
} from '../db/entities/index.js';
import {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireParam,
  respondCached,
} from '../lib/http.js';
import type { AppDatabase } from '../db/client.js';
import type { GalleryPhotoRow } from '../db/schema/index.js';
import { getEnv } from '../env.js';
import { readRendition, writeRenditions } from '../lib/galleryStore.js';
import { uploadGate } from '../lib/uploadGate.js';
import { publishGalleryActivity, publishGalleryRetracted } from '../lib/statusBus.js';
import {
  requireAnyActor,
  requireViewer,
  requireParticipant,
  requireSuperadmin,
  type AppBindings,
  type AppContext,
} from '../lib/session.js';
import { galleryModerationView, galleryPhotoView } from '../views/gallery.js';
import { readUpload } from './upload.js';

/**
 * The shared photo gallery (ADR-047) — promoted from fds.md §9.5 deferred scope.
 *
 * The database indexes photos; it never carries them. Bytes are files on the `/data` volume,
 * streamed straight from disk with `immutable` headers, so a gallery burst costs the database
 * nothing and costs the process no memory per reader.
 *
 * `bodyLimit` here is the API's first — every other payload in this app is contract-capped
 * JSON, and a file-upload route without an explicit ceiling is the one place a caller chooses
 * how much memory the server spends.
 */

/**
 * The archival original plus both served renditions plus multipart overhead (ADR-050).
 *
 * This grew by an order of magnitude when archival arrived, which is the honest cost of keeping
 * originals: the ceiling on a single request is now dominated by the raw file, not by the thumbs.
 */
const UPLOAD_BODY_LIMIT = GALLERY_RAW_MAX_BYTES + GALLERY_RENDITION_MAX_BYTES * 2 + 64 * 1024;

/** A photo id is a UUIDv7; anything else is a miss, never a query. */
const photoIdSchema = z.string().uuid();

/**
 * ADR-050 — a filename safe to put in a response header.
 *
 * The original name is participant-supplied, and `content-disposition` is a header: a name
 * containing a quote, a newline or a carriage return could close the parameter early or inject a
 * second header entirely. Quotes and control characters are stripped, path separators with them
 * (a download should never be able to suggest a directory), and an empty result falls back to a
 * name rather than emitting an empty parameter.
 */
function archiveFilename(original: string): string {
  const cleaned = original
    .replace(/[\r\n"\\]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/]/g, '_')
    .trim();
  return cleaned === '' ? 'archive' : cleaned;
}

/**
 * A hidden photo cannot be fetched, voted on, un-voted or reported: it is gone to callers.
 *
 * The id is shape-checked before it reaches the database. Without that, a traversal attempt in
 * the id position — `..%2F..%2Fsnapshot` — is handed to Postgres as a uuid and comes back as a
 * 500 carrying a driver error, which is both the wrong status and more than a caller should
 * learn from a bad request.
 */
async function visiblePhoto(c: AppContext) {
  const photoId = photoIdSchema.safeParse(requireParam(c, 'photoId'));
  if (!photoId.success) throw notFound(messages.galleryPhotoGone);
  const photo = await findGalleryPhotoById(c.get('db'), photoId.data);
  if (!photo || photo.hiddenAt) throw notFound(messages.galleryPhotoGone);
  return photo;
}

async function remainingFor(c: AppContext): Promise<number> {
  const actor = requireViewer(c);
  if (actor.type !== 'participant') return GALLERY_PHOTOS_PER_UPLOADER;
  const used = await countPhotosByParticipant(c.get('db'), actor.participant.id);
  return Math.max(0, GALLERY_PHOTOS_PER_UPLOADER - used);
}

/**
 * ADR-324 — a slot is taken BEFORE the body is read and given back when the response is done,
 * success or not. Refused uploads cost no memory: the 503 goes out with the body unread.
 */
const holdUploadSlot: MiddlewareHandler = async (_c, next) => {
  const release = uploadGate().tryEnter();
  if (release === null) throw new HttpError(503, messages.galleryBusy);
  try {
    await next();
  } finally {
    release();
  }
};

/** How long a total-bytes reading is trusted; summing a bytea column is not a per-upload cost worth paying. */
const TOTAL_BYTES_TTL_MS = 30_000;
let totalReading: { at: number; bytes: number } | null = null;

/** The suite shares a module registry, so a reading from one test must not decide the next. */
export function resetGalleryTotalForTests(): void {
  totalReading = null;
}

/**
 * ADR-324 — photos are database rows, so the gallery's total size is the database's. A full
 * volume (or a full managed-database quota) makes EVERY write fail, not only uploads, so uploads
 * stop at a ceiling the operator chose, with a plain 507, well before that.
 */
async function refuseWhenGalleryFull(db: AppDatabase): Promise<void> {
  const now = Date.now();
  if (totalReading === null || now - totalReading.at > TOTAL_BYTES_TTL_MS) {
    totalReading = { at: now, bytes: await totalBlobBytes(db) };
  }
  if (totalReading.bytes >= getEnv().GALLERY_MAX_TOTAL_BYTES) throw new HttpError(507, messages.galleryFull);
}

/**
 * What this process has just stored is added to the reading, so a burst of uploads inside the
 * 30 s window is counted as it lands instead of all seeing the same stale total.
 */
function noteStoredBytes(bytes: number): void {
  if (totalReading !== null) totalReading = { ...totalReading, bytes: totalReading.bytes + bytes };
}

async function createPhotoWithinQuota(db: AppDatabase, metadata: NewGalleryPhoto): Promise<GalleryPhotoRow> {
  try {
    return await createGalleryPhotoWithinQuota(db, { photo: metadata, limit: GALLERY_PHOTOS_PER_UPLOADER });
  } catch (error) {
    if (error instanceof GalleryQuotaError) throw conflict(messages.galleryQuotaReached);
    throw error;
  }
}

export function galleryRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();

  const refuseOversized = bodyLimit({
    maxSize: UPLOAD_BODY_LIMIT,
    // Owned copy and the right status. Without this the participant is told the server broke,
    // when in fact their photo was simply too big to accept.
    onError: () => {
      throw new HttpError(413, messages.galleryPhotoTooLarge);
    },
  });

  routes.get('/photos', async (c) => {
    // ADR-140 — a screen may read the wall. It has no votes and no uploads, so it falls into
    // the same branch a superadmin does below: the shared list, and an empty overlay.
    const actor = requireViewer(c);
    const sort = gallerySortSchema.safeParse(c.req.query('sort') ?? 'newest');
    if (!sort.success) throw badRequest(messages.notFound, 'sort');
    const viewer = actor.type === 'participant' ? actor.participant.id : null;
    /*
     * ADR-134 — the shared list and the personal overlay, read separately and sent together.
     *
     * The page is cached on the sort alone and serves the whole room; the vote ids are one
     * uncached index scan for this viewer. One response either way, per decision C3 — a second
     * endpoint would double the request count on the surface that already has the most of them.
     */
    const photos = await readGalleryPage(c.get('db'), sort.data);
    /*
     * ADR-135 — and now that ADR-134 made the big half identical for everybody, the only thing
     * that can move this body is somebody uploading, liking or hiding a photo.
     */
    return respondCached(c, {
      photos: photos.map(galleryPhotoView),
      myVoteIds: [...(await readMyVoteIds(c.get('db'), viewer))],
      remainingUploads: await remainingFor(c),
    });
  });

  routes.post('/photos', holdUploadSlot, refuseOversized, async (c) => {
    // Participants and facilitators both contribute; a superadmin moderates instead.
    const actor = requireAnyActor(c);
    if (actor.type === 'superadmin') throw forbidden();
    await refuseWhenGalleryFull(c.get('db'));

    const upload = await readUpload(c, actor);
    const row = await createPhotoWithinQuota(c.get('db'), upload.metadata);
    // Metadata first, then bytes, because the blob rows reference the photo row. Both are now in
    // the same database, so ADR-048 buys transactional integrity the disk design could not have:
    // there is no such thing as an orphaned file to clean up.
    await writeRenditions(c.get('db'), {
      photoId: row.id,
      kind: upload.kind,
      renditions: upload.renditions,
    });
    /*
     * ADR-125 — the gallery's LED, which it never had before. Published after the bytes land,
     * not before: a dot that arrives while the renditions are still being written sends people
     * to a photo that cannot yet be drawn.
     */
    publishGalleryActivity(row.visibleSince);
    noteStoredBytes(upload.renditions.reduce((sum, entry) => sum + entry.bytes.byteLength, 0));
    return c.json({ photo: galleryPhotoView({ ...row, voteCount: 0 }) }, 201);
  });

  addByteRoutes(routes);
  addReactionRoutes(routes);
  return routes;
}

/**
 * Everything that hands back image bytes: the archive and the two served renditions.
 *
 * Order matters inside here, and the comment on the archive route says why.
 */
function addByteRoutes(routes: Hono<AppBindings>): void {
  /**
   * ADR-050 — Corporate's archive: the untouched original, superadmin only.
   *
   * This is the ONLY way a raw byte leaves the system. The public rendition route validates against
   * `galleryRenditionSchema`, which does not contain `raw`, so `.../raw` cannot resolve there — the
   * separation is structural rather than a rule someone has to remember.
   *
   * It deliberately ignores `hidden_at`: a hidden photo is hidden from the event, not deleted, and
   * an archive that silently omitted moderated photos would be the wrong archive. It also does not
   * touch the blob cache, because a once-per-event bulk export has no business evicting the thumbs
   * three hundred phones are reading.
   *
   * **Registered BEFORE `/photos/:photoId/:rendition` on purpose.** Hono matches in registration
   * order, so with the generic route first `archive` is swallowed as a rendition name, fails the
   * enum, and 404s before this guard is ever reached.
   */
  routes.get('/photos/:photoId/archive', async (c) => {
    requireSuperadmin(c);
    const photoId = photoIdSchema.safeParse(requireParam(c, 'photoId'));
    if (!photoId.success) throw notFound(messages.galleryPhotoGone);
    const photo = await findGalleryPhotoById(c.get('db'), photoId.data);
    if (!photo) throw notFound(messages.galleryPhotoGone);

    const stored = await findGalleryBlob(c.get('db'), photo.id, 'raw');
    if (!stored) throw notFound(messages.galleryPhotoGone);

    return new Response(stored.bytes.slice(), {
      headers: {
        'content-type': stored.mime,
        'content-length': String(stored.bytes.byteLength),
        // The original name, so an archive of three hundred files is navigable by a human.
        'content-disposition': `attachment; filename="${archiveFilename(photo.originalFilename)}"`,
        // Archival originals are immutable too, but a bulk export should not fill a browser cache.
        'cache-control': 'private, no-store',
      },
    });
  });

  /**
   * The bytes. A hidden photo stops being served the moment it is hidden — moderation that only
   * removed a thumbnail from a listing would not be moderation at all.
   */
  routes.get('/photos/:photoId/:rendition', async (c) => {
    // A screen that may list the photos must be able to fetch their bytes, or it shows frames.
    requireViewer(c);
    const rendition = galleryRenditionSchema.safeParse(requireParam(c, 'rendition'));
    if (!rendition.success) throw notFound(messages.galleryPhotoGone);
    const photo = await visiblePhoto(c);

    // Visibility is checked against metadata BEFORE any cache or blob read, so hiding a photo
    // takes effect immediately even for one that is already cached.
    const file = await readRendition(c.get('db'), {
      photoId: photo.id,
      rendition: rendition.data,
      ifNoneMatch: c.req.header('if-none-match') ?? null,
    });
    if (!file) throw notFound(messages.galleryPhotoGone);
    return file;
  });
}

/** Liking, un-liking, reporting and hiding: everything done *to* a photo after it is shared. */
function addReactionRoutes(routes: Hono<AppBindings>): void {
  routes.post('/photos/:photoId/vote', async (c) => {
    const actor = requireParticipant(c);
    const photo = await visiblePhoto(c);
    await castVote(c.get('db'), photo.id, actor.participant.id);
    return c.json({ ok: true }, 201);
  });

  routes.delete('/photos/:photoId/vote', async (c) => {
    const actor = requireParticipant(c);
    const photo = await visiblePhoto(c);
    await invalidateVote(c.get('db'), photo.id, actor.participant.id);
    return c.json({ ok: true });
  });

  /** The consent takedown path: reporting must not need a facilitator standing nearby. */
  routes.post('/photos/:photoId/report', async (c) => {
    const actor = requireParticipant(c);
    const photo = await visiblePhoto(c);
    const filed = await reportPhoto(c.get('db'), photo.id, actor.participant.id);
    if (!filed) throw conflict(messages.galleryAlreadyReported);
    return c.json({ ok: true }, 201);
  });

  routes.post('/photos/:photoId/hide', async (c) => {
    requireSuperadmin(c);
    const photoId = photoIdSchema.safeParse(requireParam(c, 'photoId'));
    if (!photoId.success) throw notFound(messages.galleryPhotoGone);
    const row = await invalidateGalleryPhoto(c.get('db'), photoId.data);
    if (!row) throw notFound(messages.galleryPhotoGone);
    // ADR-153 — the wall's latest may have just moved backwards; the unhide below has always
    // published its counterpart, and the asymmetry was the defect.
    publishGalleryRetracted(await latestGalleryActivity(c.get('db')));
    return c.json({ photo: galleryPhotoView({ ...row, voteCount: 0 }) });
  });

  /** A hide is reversible: moderation nobody can undo is a decision nobody wants to make. */
  routes.post('/photos/:photoId/unhide', async (c) => {
    requireSuperadmin(c);
    const photoId = photoIdSchema.safeParse(requireParam(c, 'photoId'));
    if (!photoId.success) throw notFound(messages.galleryPhotoGone);
    const row = await restoreGalleryPhoto(c.get('db'), photoId.data);
    if (!row) throw notFound(messages.galleryPhotoGone);
    // ADR-125 — a restored photo is new to everyone who never saw it, so it lights the dot.
    publishGalleryActivity(row.visibleSince);
    return c.json({ photo: galleryPhotoView({ ...row, voteCount: 0 }) });
  });

  /** The moderation console's own read: hidden photos included, report counts first. */
  routes.get('/moderation', async (c) => {
    requireSuperadmin(c);
    const rows = await listPhotosForModeration(c.get('db'));
    return c.json({ photos: rows.map(galleryModerationView) });
  });
}
