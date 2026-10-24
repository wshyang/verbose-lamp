import type { GalleryStoredRendition } from '@psd/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId } from '../ids.js';
import { galleryBlobs } from '../schema/index.js';
import { firstOrNull } from '../rows.js';

/**
 * Photo bytes in Postgres (ADR-048). This module is mitigation **M6** made structural: it exposes
 * exactly ONE read of a payload, by key, with its columns named.
 *
 * That discipline is the whole defence. There is no "list blobs", no "blobs for photo", and no
 * bare `select()` anywhere in this file — because any of those would let a future caller turn a
 * gallery listing into a scan over every byte in the event, through the one serialized connection
 * a facilitator's match score is also waiting on.
 *
 * If you need to know how big the corpus is, use `totalBlobBytes()`. It sums the stored
 * `byte_size` column and never touches a payload.
 */

export interface NewGalleryBlob {
  photoId: string;
  rendition: GalleryStoredRendition;
  mime: string;
  bytes: Uint8Array;
}

export interface StoredBlob {
  mime: string;
  bytes: Uint8Array;
}

export async function insertGalleryBlob(db: Executor, input: NewGalleryBlob): Promise<void> {
  await db
    .insert(galleryBlobs)
    .values({
      id: newId(),
      photoId: input.photoId,
      rendition: input.rendition,
      mime: input.mime,
      byteSize: input.bytes.byteLength,
      payload: input.bytes,
    })
    // The unique index on (photo_id, rendition) makes a retried upload idempotent rather than a
    // constraint violation the caller has to interpret.
    .onConflictDoNothing();
}

/**
 * THE read. One row, by (photo, rendition), columns named explicitly.
 *
 * Keep it that way: the moment this becomes a multi-row or column-list-free query, the safety
 * property the two-table split was built for is gone.
 */
export async function findGalleryBlob(
  db: Executor,
  photoId: string,
  rendition: GalleryStoredRendition,
): Promise<StoredBlob | null> {
  const rows = await db
    .select({ mime: galleryBlobs.mime, payload: galleryBlobs.payload })
    .from(galleryBlobs)
    .where(and(eq(galleryBlobs.photoId, photoId), eq(galleryBlobs.rendition, rendition)))
    .limit(1);
  const row = firstOrNull(rows);
  return row ? { mime: row.mime, bytes: row.payload } : null;
}

/** Corpus size from the stored sizes — never `length(payload)`, which would read everything. */
export async function totalBlobBytes(db: Executor): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${galleryBlobs.byteSize}), 0)::bigint` })
    .from(galleryBlobs);
  return Number(firstOrNull(rows)?.total ?? 0);
}
