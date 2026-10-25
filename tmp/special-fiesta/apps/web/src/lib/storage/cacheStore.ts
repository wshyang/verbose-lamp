import { readItem, removeItem, writeItem } from './localStore.js';

/**
 * ADR-112 — the client twin of the server's cachedRead (ADR-038): server answers, kept
 * on the device, so navigation stops re-buying what the phone already knows.
 *
 * This module is the only owner of `psd.cache.v1` (ADR-019). Three rules make it safe
 * to be aggressive:
 *   - every entry is namespaced by the ACTOR it was fetched for — two people on one
 *     phone can never see each other's team or chat through the cache;
 *   - sign-in and sign-out PURGE the whole file (wired in the token store, the one
 *     place every session change passes through);
 *   - entries only ever hold SERVER ANSWERS, never guesses — so serving one is a "yes"
 *     state under ADR-099, not a decision made early.
 *
 * Budgeted and LRU-evicted like the sprite cache; versioned keys discard rather than
 * migrate; a browser that refuses storage simply misses every read, which is slower and
 * still correct.
 */

export const DATA_CACHE_KEY = 'psd.cache.v1';
/** JSON caches stay far below the sprite budget: ~256 kB of a 5 MB quota. */
const MAX_BYTES = 256_000;

interface CacheEntry {
  at: number;
  data: unknown;
}

interface CacheFile {
  entries: Record<string, CacheEntry>;
  /** entry keys, least recently used first. */
  order: string[];
}

function readFile(): CacheFile {
  const raw = readItem(DATA_CACHE_KEY);
  if (raw === null) return { entries: {}, order: [] };
  try {
    const parsed = JSON.parse(raw) as CacheFile;
    if (typeof parsed.entries !== 'object' || !Array.isArray(parsed.order)) throw new Error('shape');
    return parsed;
  } catch {
    return { entries: {}, order: [] };
  }
}

function writeFile(file: CacheFile): void {
  let serialized = JSON.stringify(file);
  while (serialized.length > MAX_BYTES && file.order.length > 0) {
    const evict = file.order.shift() as string;
    delete file.entries[evict];
    serialized = JSON.stringify(file);
  }
  writeItem(DATA_CACHE_KEY, serialized);
}

function entryKey(name: string, actorId: string): string {
  return `${actorId}:${name}`;
}

function touch(file: CacheFile, key: string): void {
  file.order = [...file.order.filter((existing) => existing !== key), key];
}

function discard(file: CacheFile, key: string): void {
  delete file.entries[key];
  file.order = file.order.filter((existing) => existing !== key);
}

export function readCached<T>(
  name: string,
  actorId: string,
  maxAgeMs: number,
): { data: T; at: number } | null {
  const file = readFile();
  const key = entryKey(name, actorId);
  const entry = file.entries[key];
  if (!entry) return null;
  // A strict caller missing must not erase a still-useful entry for a caller with a wider policy.
  if (Date.now() - entry.at >= maxAgeMs) return null;
  // Reads count: without this touch a popular board snapshot would be evicted as if unused.
  touch(file, key);
  writeFile(file);
  return { data: entry.data as T, at: entry.at };
}

export function writeCached(name: string, actorId: string, data: unknown): void {
  const file = readFile();
  const key = entryKey(name, actorId);
  file.entries[key] = { at: Date.now(), data };
  touch(file, key);
  writeFile(file);
}

/** Drops one name for every actor — the invalidation hook a mutation calls. */
export function invalidateCached(name: string): void {
  const file = readFile();
  const doomed = Object.keys(file.entries).filter((key) => key.endsWith(`:${name}`));
  for (const key of doomed) discard(file, key);
  writeFile(file);
}

/** A mutation that changes a collection can clear the corresponding family of parameterised keys. */
export function invalidateCachedPrefix(prefix: string): void {
  const file = readFile();
  const doomed = Object.keys(file.entries).filter((key) => key.slice(key.indexOf(':') + 1).startsWith(prefix));
  for (const key of doomed) discard(file, key);
  writeFile(file);
}

/** The sign-in/sign-out purge: a handed-over phone keeps nothing. */
export function purgeAllCached(): void {
  removeItem(DATA_CACHE_KEY);
}
