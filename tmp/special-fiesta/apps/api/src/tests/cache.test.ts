import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SCOREBOARD_TAG,
  cachedRead,
  forgetSpriteBody,
  invalidateTag,
  rememberSpriteBody,
  resetCachesForTests,
  scopeOf,
  spriteBodies,
  spriteEpochNow,
} from '../lib/cache.js';

/**
 * ADR-038 — the decorator itself, over stub reads. What must be true of every decorated
 * read: repeats inside the window cost one query, a tagged write voids the memory, and
 * two databases never answer for each other.
 */

afterEach(() => {
  resetCachesForTests();
  vi.useRealTimers();
});

describe('cachedRead', () => {
  it('asks the database once for identical calls inside the window', async () => {
    const db = {};
    const read = vi.fn(async (handle: object, id: string) => `${scopeOf(handle)}-${id}`);
    const decorated = cachedRead(read, {
      name: 'test.window',
      ttlMs: 60_000,
      key: (id) => id,
    });

    const [first, second, third] = await Promise.all([
      decorated(db, 'a'),
      decorated(db, 'a'),
      decorated(db, 'a'),
    ]);

    expect(first).toBe(second);
    expect(second).toBe(third);
    // Three concurrent polls shared ONE query — the stampede case, not just the repeat.
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keys by argument, so different questions get different answers', async () => {
    const db = {};
    const read = vi.fn(async (_db: object, id: string) => `answer-${id}`);
    const decorated = cachedRead(read, { name: 'test.args', ttlMs: 60_000, key: (id) => id });

    expect(await decorated(db, 'a')).toBe('answer-a');
    expect(await decorated(db, 'b')).toBe('answer-b');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('forgets everything under a tag the moment a write invalidates it', async () => {
    const db = {};
    let version = 0;
    const read = vi.fn(async () => {
      version += 1;
      return version;
    });
    const decorated = cachedRead(read, {
      name: 'test.tagged',
      ttlMs: 60_000,
      tags: [SCOREBOARD_TAG],
    });

    expect(await decorated(db)).toBe(1);
    expect(await decorated(db)).toBe(1);
    invalidateTag(SCOREBOARD_TAG);
    // The very next read recomputes — the F44 void/unvoid guarantee.
    expect(await decorated(db)).toBe(2);
  });

  it('computes tags per call, so one team room never voids another (ADR-094)', async () => {
    const db = {};
    const read = vi.fn(async (_db: object, teamId: string) => `${teamId}-${read.mock.calls.length}`);
    const decorated = cachedRead(read, {
      name: 'test.dynamicTags',
      ttlMs: 60_000,
      tags: (teamId) => [`team-chat:${teamId}`],
      key: (teamId) => teamId,
    });

    expect(await decorated(db, 'alpha')).toBe('alpha-1');
    expect(await decorated(db, 'beta')).toBe('beta-2');
    invalidateTag('team-chat:alpha');

    // Alpha recomputes; beta still answers from memory.
    expect(await decorated(db, 'alpha')).toBe('alpha-3');
    expect(await decorated(db, 'beta')).toBe('beta-2');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('never lets one database answer for another', async () => {
    const dbA = {};
    const dbB = {};
    const read = vi.fn(async (handle: object) => `scope-${scopeOf(handle)}`);
    const decorated = cachedRead(read, { name: 'test.scopes', ttlMs: 60_000 });

    const a = await decorated(dbA);
    const b = await decorated(dbB);

    expect(a).not.toBe(b);
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('spriteBodies', () => {
  it('is bounded, so an id-guessing crowd cannot grow it without limit', () => {
    expect(spriteBodies.max).toBe(4000);
  });

  /*
   * ADR-228 — a removed face is not served from memory, and a read that was already in flight when the
   * face came off does not put it back.
   */
  it('forgets a face taken off, and does not write back a body fetched before that', () => {
    const scope = 9001;
    rememberSpriteBody({ scope, id: 'abc', sprite: 'the-face', epoch: spriteEpochNow() });
    expect(spriteBodies.get(`${scope}:abc`)).toBe('the-face');

    const inFlight = spriteEpochNow();
    forgetSpriteBody(scope, 'abc');
    expect(spriteBodies.get(`${scope}:abc`)).toBeUndefined();

    rememberSpriteBody({ scope, id: 'abc', sprite: 'the-face', epoch: inFlight });
    expect(spriteBodies.get(`${scope}:abc`)).toBeUndefined();

    rememberSpriteBody({ scope, id: 'abc', sprite: 'the-face', epoch: spriteEpochNow() });
    expect(spriteBodies.get(`${scope}:abc`)).toBe('the-face');
  });
});

describe('the cache is bounded in bytes, not only entries (ADR-324)', () => {
  it('evicts by size, so a few large answers cannot hold the memory a thousand small ones would', async () => {
    const { CACHE_MAX_BYTES } = await import('../lib/cache.js');
    const db = {};
    const huge = 'x'.repeat(Math.floor(CACHE_MAX_BYTES / 3));
    // Two entries fit; the third pushes the first out. Six prove it twice over.
    const read = vi.fn(async (_handle: object, id: string) => ({ id, payload: huge }));
    const decorated = cachedRead(read, { name: 'test.bytes', ttlMs: 60_000, key: (id: string) => id });
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) await decorated(db, id);
    expect(read).toHaveBeenCalledTimes(6);
    // The first entries were pushed out by size: asking again reads again.
    await decorated(db, 'a');
    expect(read).toHaveBeenCalledTimes(7);
    // The most recent is still held.
    await decorated(db, 'f');
    expect(read).toHaveBeenCalledTimes(7);
  });

  it('still holds many small answers: the byte budget does not shrink the ordinary working set', async () => {
    const db = {};
    const read = vi.fn(async (_handle: object, id: string) => ({ id }));
    const decorated = cachedRead(read, { name: 'test.small', ttlMs: 60_000, key: (id: string) => id });
    for (let id = 0; id < 400; id += 1) await decorated(db, String(id));
    for (let id = 0; id < 400; id += 1) await decorated(db, String(id));
    expect(read).toHaveBeenCalledTimes(400);
  });

  it('bounds the sprite body cache by size too', async () => {
    const { SPRITE_CACHE_MAX_BYTES } = await import('../lib/cache.js');
    const body = 'y'.repeat(50_000);
    const count = Math.ceil(SPRITE_CACHE_MAX_BYTES / body.length) + 20;
    for (let index = 0; index < count; index += 1) rememberSpriteBody({ scope: 1, id: `id${index}`, sprite: body, epoch: spriteEpochNow() });
    let held = 0;
    for (let index = 0; index < count; index += 1) if (spriteBodies.has(`1:id${index}`)) held += 1;
    expect(held).toBeLessThan(count);
    expect(held * body.length).toBeLessThanOrEqual(SPRITE_CACHE_MAX_BYTES + body.length);
  });
});
