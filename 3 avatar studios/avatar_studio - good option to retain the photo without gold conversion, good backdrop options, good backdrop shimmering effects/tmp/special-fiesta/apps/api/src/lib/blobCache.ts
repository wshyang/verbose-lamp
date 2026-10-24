import { LRUCache } from 'lru-cache';

/**
 * ADR-048, mitigation **M4** — the second cache tier in front of Postgres-held photo bytes.
 *
 * Why this exists at all: with bytes in the database, every cold read of a photo is a read
 * through PGlite's single serialized connection, queued alongside a facilitator's match score.
 * A hundred phones opening a 24-thumb gallery cold is ~2,400 such reads. This cache turns that
 * into ~24, because the same two dozen thumbs are what everyone is asking for.
 *
 * Why it is a SEPARATE cache and not `lib/cache.ts`: that store is bounded by **entry count**
 * (`max: 5000`) with no `sizeCalculation`, which is fine for aggregates of a few kilobytes and
 * catastrophic for blobs — 5,000 × 300 kB is 1.5 GB of resident memory, silently. That is the
 * assessment's R4, and it is trivial to avoid by budgeting in BYTES, which is what this does.
 *
 * Invalidation is not a concern here, which is the one genuinely easy thing about caching photos:
 * a photo is immutable once uploaded and its key includes its id, so an entry can never be stale.
 * A hidden photo is handled before this cache is consulted — the route checks visibility against
 * metadata first, so hiding takes effect immediately even for a cached blob.
 */

export interface CachedBlob {
  mime: string;
  bytes: Uint8Array;
}

/**
 * 64 MB. Chosen against the corpus rather than picked round: the caps allow 300 users × 10 photos
 * ≈ 3,000 photos, and every thumb (~20 kB) is ~60 MB — so in practice the entire thumbnail corpus,
 * which is what a grid asks for, fits. Full-size views then share whatever is left.
 */
const MAX_BYTES = 64 * 1024 * 1024;

const blobs = new LRUCache<string, CachedBlob>({
  maxSize: MAX_BYTES,
  sizeCalculation: (value) => value.bytes.byteLength,
});

function keyFor(photoId: string, rendition: string): string {
  return `${photoId}:${rendition}`;
}

export function readCachedBlob(photoId: string, rendition: string): CachedBlob | null {
  return blobs.get(keyFor(photoId, rendition)) ?? null;
}

export function cacheBlob(photoId: string, rendition: string, blob: CachedBlob): void {
  blobs.set(keyFor(photoId, rendition), blob);
}

/** Test seam, and the post-event reclaim path's companion (M7). */
export function forgetCachedBlobs(): void {
  blobs.clear();
}

/** Exposed so a test can prove the budget is in bytes rather than entries. */
export function cachedBlobBytes(): number {
  return blobs.calculatedSize;
}
