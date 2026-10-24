import { parseAvatarSprite } from '@psd/contracts';
import { readItem, writeItem } from '../storage/localStore.js';

/**
 * ADR-035 — photo sprites, kept on the device.
 *
 * A sprite is named by a hash of itself, so it can never go stale: the same id is always
 * the same face. That makes localStorage the right place for it — a participant's phone
 * fetches each face once, ever, and every poll after that is sixteen characters of id
 * instead of three kilobytes of picture.
 *
 * This module is the only owner of `psd.sprites.v1` (ADR-019). It refuses to grow past a
 * budget and forgets the least recently seen first; a browser that will not store
 * anything (private mode, a sandboxed frame) simply keeps missing and re-fetching, which
 * is slower and still correct.
 */

export const SPRITE_CACHE_KEY = 'psd.sprites.v1';
/**
 * Roughly 150 faces at the ~12 kB a 128×128 sprite runs to (ADR-037): under 2 MB of a
 * 5 MB quota, and still more faces than one phone meets in a day.
 */
const MAX_ENTRIES = 150;

interface CacheFile {
  /** id → sprite code. */
  sprites: Record<string, string>;
  /** ids, least recently used first. */
  order: string[];
}

const EMPTY: CacheFile = { sprites: {}, order: [] };

function read(): CacheFile {
  const raw = readItem(SPRITE_CACHE_KEY);
  if (raw === null) return EMPTY;
  const parsed = attempt(raw);
  if (parsed === null) return EMPTY;
  return parsed;
}

function attempt(raw: string): CacheFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    if (typeof parsed.sprites !== 'object' || parsed.sprites === null) return null;
    if (!Array.isArray(parsed.order)) return null;
    return { sprites: parsed.sprites as Record<string, string>, order: parsed.order };
  } catch {
    return null;
  }
}

/**
 * localStore never throws — a store that refuses a write keeps the value in memory for
 * the life of the page — so there is nothing to catch here. The budget above is what
 * keeps this from being the write that gets refused.
 */
function write(file: CacheFile): void {
  writeItem(SPRITE_CACHE_KEY, JSON.stringify(file));
}

/** What this device already has, of the ids asked for. */
export function readCachedSprites(ids: readonly string[]): Map<string, string> {
  const file = read();
  const found = new Map<string, string>();
  for (const id of ids) {
    const sprite = file.sprites[id];
    if (sprite !== undefined) found.set(id, sprite);
  }
  return found;
}

/**
 * ADR-238 — every face this device holds. A sprite store reads it once, when it mounts, so the first paint of
 * a page already has them and no avatar draws the stand-in for a face the device has had since the last visit.
 */
export function readAllCachedSprites(): Record<string, string> {
  return read().sprites;
}

/** Keeps what parses, forgets the oldest, and never throws. */
export function cacheSprites(arriving: ReadonlyMap<string, string>): void {
  if (arriving.size === 0) return;
  const file = read();
  const sprites = { ...file.sprites };
  const order = file.order.filter((id) => !arriving.has(id));
  for (const [id, sprite] of arriving) {
    if (parseAvatarSprite(sprite) === null) continue;
    sprites[id] = sprite;
    order.push(id);
  }
  while (order.length > MAX_ENTRIES) {
    const dropped = order.shift();
    if (dropped !== undefined) delete sprites[dropped];
  }
  const kept: Record<string, string> = {};
  for (const id of order) {
    const sprite = sprites[id];
    if (sprite !== undefined) kept[id] = sprite;
  }
  write({ sprites: kept, order });
}

export function forgetCachedSprites(): void {
  writeItem(SPRITE_CACHE_KEY, JSON.stringify(EMPTY));
}

/**
 * ADR-228 — a face this participant has just taken off, or replaced, is forgotten on this device. Only here:
 * other devices keep the faces they have already fetched, and the server cannot reach them (a stated limit).
 */
export function forgetCachedSprite(id: string): void {
  const file = read();
  if (file.sprites[id] === undefined && !file.order.includes(id)) return;
  const sprites = { ...file.sprites };
  delete sprites[id];
  write({ sprites, order: file.order.filter((entry) => entry !== id) });
}
