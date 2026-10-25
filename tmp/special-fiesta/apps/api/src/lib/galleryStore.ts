import type { GalleryRendition, GalleryStoredRendition } from '@psd/contracts';
import type { Executor } from '../db/client.js';
import { findGalleryBlob, insertGalleryBlob } from '../db/entities/galleryBlobs.js';
import { cacheBlob, readCachedBlob } from './blobCache.js';

/**
 * The gallery's bytes (ADR-047, moved into Postgres by ADR-048).
 *
 * Everything about serving a photo is a cache decision, because the origin is now a read through
 * PGlite's single serialized connection — the same one a facilitator's match score queues behind.
 * Two tiers, in order:
 *
 *   **M3, the browser.** A photo is immutable and its id is in its URL, so responses carry
 *   `immutable` plus a strong `ETag`, and a conditional request gets a 304 with no body and no
 *   database read at all. This is the cheapest 90 %: every phone reads each photo about once.
 *
 *   **M4, the byte-budgeted process cache.** What survives tier one is the cold burst — a hundred
 *   phones opening a 24-thumb grid at once, which would otherwise be ~2,400 serialized reads. The
 *   cache collapses that to ~24.
 *
 * Only then does it ask Postgres.
 */

/** Detected from the bytes themselves — a declared content type is a claim, not evidence. */
const SIGNATURES: { mime: 'image/webp' | 'image/jpeg' | 'image/png'; matches: (b: Uint8Array) => boolean }[] = [
  {
    mime: 'image/webp',
    matches: (bytes) =>
      bytes.length > 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP',
  },
  {
    mime: 'image/jpeg',
    matches: (bytes) =>
      bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mime: 'image/png',
    matches: (bytes) =>
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47,
  },
];

export interface ImageKind {
  mime: 'image/webp' | 'image/jpeg' | 'image/png';
}

/**
 * Returns the real format, or null if these bytes are not an image we serve. Sniffing is the
 * server-side guard: a browser's declared `type` is caller-controlled, and a file that is not an
 * image has no business being handed back to three hundred phones under an image content type.
 */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const found = SIGNATURES.find((candidate) => candidate.matches(bytes));
  return found ? { mime: found.mime } : null;
}

export interface StoredRendition {
  rendition: GalleryStoredRendition;
  bytes: Uint8Array;
  /** Set for the archival original, whose type comes from its filename rather than a sniff. */
  mime?: string;
}

/**
 * ADR-050 — the archival original's content type, from its extension.
 *
 * Extension rather than sniffing, because the whole point of the raw copy is that it may be a
 * format this server has no business understanding — HEIC today, something else next year. The
 * value is advisory: it rides on the archive download so Corporate's tooling recognises the file,
 * and nothing in the app decodes it.
 */
const RAW_MIME_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  dng: 'image/x-adobe-dng',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
  gif: 'image/gif',
};

export function rawMimeFor(filename: string): string {
  const extension = filename.toLowerCase().split('.').pop() ?? '';
  return RAW_MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export interface WriteRenditionsInput {
  photoId: string;
  kind: ImageKind;
  renditions: readonly StoredRendition[];
}

export async function writeRenditions(db: Executor, input: WriteRenditionsInput): Promise<void> {
  for (const entry of input.renditions) {
    await insertGalleryBlob(db, {
      photoId: input.photoId,
      rendition: entry.rendition,
      // The served renditions share the sniffed type; the archival original carries its own.
      mime: entry.mime ?? input.kind.mime,
      bytes: entry.bytes,
    });
  }
}

/**
 * A photo is immutable, so its identity is enough to tag it — no hashing of the payload needed,
 * which would mean reading the payload just to answer a conditional request.
 */
function etagFor(photoId: string, rendition: GalleryRendition): string {
  return `"${photoId}-${rendition}"`;
}

function imageResponse(mime: string, bytes: Uint8Array, etag: string): Response {
  // A fresh copy, because the cached entry must not be handed out as a mutable view of itself.
  const body = bytes.slice();
  return new Response(body, {
    headers: {
      'content-type': mime,
      'content-length': String(body.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      etag,
    },
  });
}

/**
 * Serves a rendition, or null when there is no such blob.
 *
 * `ifNoneMatch` is the caller's `if-none-match` header. When it matches, this returns a 304 having
 * touched neither the cache nor the database — which is the point of tier one.
 */
export interface ReadRenditionInput {
  photoId: string;
  rendition: GalleryRendition;
  /** The caller's `if-none-match` header, or null when it sent none. */
  ifNoneMatch: string | null;
}

export async function readRendition(
  db: Executor,
  input: ReadRenditionInput,
): Promise<Response | null> {
  const { photoId, rendition, ifNoneMatch } = input;
  const etag = etagFor(photoId, rendition);
  if (ifNoneMatch && ifNoneMatch.includes(etag)) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': 'public, max-age=31536000, immutable' },
    });
  }

  const cached = readCachedBlob(photoId, rendition);
  if (cached) return imageResponse(cached.mime, cached.bytes, etag);

  const stored = await findGalleryBlob(db, photoId, rendition);
  if (!stored) return null;

  cacheBlob(photoId, rendition, { mime: stored.mime, bytes: stored.bytes });
  return imageResponse(stored.mime, stored.bytes, etag);
}
