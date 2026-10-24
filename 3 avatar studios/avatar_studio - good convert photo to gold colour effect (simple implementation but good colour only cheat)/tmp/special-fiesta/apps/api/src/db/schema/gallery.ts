import type { ClusterCode, GalleryStoredRendition } from '@psd/contracts';
import { boolean, customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { clusters, facilitatorAccounts, participants } from './identity.js';

/**
 * Gallery domain (ADR-047, bytes moved into Postgres by ADR-048).
 *
 * The two tables are split on purpose (mitigation M1): `galleryPhotos` carries metadata and
 * `galleryBlobs` carries bytes, so a listing physically cannot read one. Never add a payload
 * column to `galleryPhotos`, and never widen a blob read to a bare `select()`.
 *
 * The uploader label and cluster are snapshot at write time (non-negotiable #7), the same way
 * chat and fringe freeze theirs, so a rename cannot rewrite the wall.
 */

/**
 * Drizzle's pg-core has no `bytea`, so it needs a custom type — and this is exactly where the
 * classic encoding mistake lives (the assessment's R10).
 *
 * The drivers do not agree on what comes back: `pg` hands over a Node `Buffer`, while PGlite
 * hands over a plain `Uint8Array`. A `Buffer` IS a `Uint8Array`, so normalising on the way out
 * keeps callers from having to know which driver they are on — and stops a `Buffer`-only method
 * being reached for and then failing under the other driver.
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return value instanceof Uint8Array ? value : new Uint8Array(value);
  },
});

export const galleryPhotos = pgTable('gallery_photo', {
  id: uuid('id').primaryKey(),
  uploaderType: text('uploader_type').$type<'participant' | 'facilitator'>().notNull(),
  participantId: uuid('participant_id').references(() => participants.id),
  facilitatorId: uuid('facilitator_id').references(() => facilitatorAccounts.id),
  uploaderLabelSnapshot: text('uploader_label_snapshot').notNull(),
  clusterCodeSnapshot: text('cluster_code_snapshot')
    .$type<ClusterCode>()
    .references(() => clusters.code),
  caption: text('caption').notNull().default(''),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  /** ADR-050 — the archival original's identity; its bytes are a `raw` row in `galleryBlobs`. */
  originalFilename: text('original_filename').notNull(),
  sha1Raw: text('sha1_raw').notNull(),
  rawByteSize: integer('raw_byte_size').notNull(),
  /** ADR-052 — false when the original was re-encoded on the phone to fit the cap. */
  rawIsOriginal: boolean('raw_is_original').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  /** ADR-125 — when the photo last became visible; moved by a restore, so the LED still fires. */
  visibleSince: timestamp('visible_since', { withTimezone: true }).notNull().defaultNow(),
});

/** A like. Un-voting sets `expiresAt`; the partial unique index enforces one active vote. */
export const galleryVotes = pgTable('gallery_vote', {
  id: uuid('id').primaryKey(),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => galleryPhotos.id),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const galleryReports = pgTable('gallery_report', {
  id: uuid('id').primaryKey(),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => galleryPhotos.id),
  participantId: uuid('participant_id')
    .notNull()
    .references(() => participants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ADR-048 — the bytes. Its own table so a listing cannot touch it (M1), and read by exactly one
 * key-lookup in `entities/galleryBlobs.ts` (M6).
 *
 * `byteSize` is stored rather than derived so a moderation or accounting read can total the
 * corpus without loading a single payload — asking `sum(byte_size)` costs nothing, whereas
 * asking `sum(length(payload))` would read every photo in the event.
 */
export const galleryBlobs = pgTable('gallery_blob', {
  id: uuid('id').primaryKey(),
  photoId: uuid('photo_id')
    .notNull()
    .references(() => galleryPhotos.id),
  rendition: text('rendition').$type<GalleryStoredRendition>().notNull(),
  mime: text('mime').notNull(),
  byteSize: integer('byte_size').notNull(),
  payload: bytea('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type GalleryPhotoRow = typeof galleryPhotos.$inferSelect;
