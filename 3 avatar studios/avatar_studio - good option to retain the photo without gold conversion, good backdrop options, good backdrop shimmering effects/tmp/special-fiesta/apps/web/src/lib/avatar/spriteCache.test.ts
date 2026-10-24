import { beforeEach, describe, expect, it } from 'vitest';
import { avatarSpriteId, formatAvatarSprite } from '@psd/contracts';
import {
  SPRITE_CACHE_KEY,
  cacheSprites,
  forgetCachedSprite,
  readCachedSprites,
} from './spriteCache.js';

/**
 * ADR-035 — a face is fetched once per device, ever. What matters here is that the cache
 * keeps what it is given, forgets the oldest rather than growing without end, and treats
 * anything it cannot trust as a miss.
 */

const spriteOf = (fill: string) =>
  formatAvatarSprite({
    size: 64,
    palette: ['#1d5b8c', '#12243a'],
    rows: Array.from({ length: 64 }, () => fill.repeat(64)),
  });

beforeEach(() => {
  // Cleared, not emptied: a browser that has never seen this app has no file at all.
  window.localStorage.clear();
});

describe('sprite cache', () => {
  it('gives back what it was given, and nothing it was not', () => {
    const sprite = spriteOf('0');
    const id = avatarSpriteId(sprite);

    expect(readCachedSprites([id]).size).toBe(0);
    cacheSprites(new Map([[id, sprite]]));

    expect(readCachedSprites([id]).get(id)).toBe(sprite);
    expect(readCachedSprites(['0000000000000000']).size).toBe(0);
  });

  it('survives a page reload, which is the entire point', () => {
    const sprite = spriteOf('1');
    cacheSprites(new Map([['aaaaaaaaaaaaaaaa', sprite]]));

    // Whatever is in storage is all the next page has.
    const raw = window.localStorage.getItem(SPRITE_CACHE_KEY);
    expect(raw).toContain('aaaaaaaaaaaaaaaa');
    expect(readCachedSprites(['aaaaaaaaaaaaaaaa']).get('aaaaaaaaaaaaaaaa')).toBe(sprite);
  });

  it('refuses to keep something that is not a sprite', () => {
    cacheSprites(new Map([['bbbbbbbbbbbbbbbb', 'not-a-sprite']]));

    expect(readCachedSprites(['bbbbbbbbbbbbbbbb']).size).toBe(0);
  });

  it('forgets the least recently seen once it is full', () => {
    const sprite = spriteOf('0');
    const ids = Array.from({ length: 405 }, (_unused, index) => String(index).padStart(16, '0'));
    for (const id of ids) cacheSprites(new Map([[id, sprite]]));

    // The first handful are gone; the last are all there.
    expect(readCachedSprites(ids.slice(0, 5)).size).toBe(0);
    expect(readCachedSprites(ids.slice(-5)).size).toBe(5);
  });

  it('shrugs at a storage full of nonsense', () => {
    window.localStorage.setItem(SPRITE_CACHE_KEY, 'not json at all');
    expect(readCachedSprites(['cccccccccccccccc']).size).toBe(0);

    window.localStorage.setItem(SPRITE_CACHE_KEY, JSON.stringify({ sprites: 'wrong', order: 3 }));
    expect(readCachedSprites(['cccccccccccccccc']).size).toBe(0);

    window.localStorage.setItem(SPRITE_CACHE_KEY, JSON.stringify({ sprites: null, order: [] }));
    expect(readCachedSprites(['cccccccccccccccc']).size).toBe(0);

    window.localStorage.setItem(SPRITE_CACHE_KEY, JSON.stringify({ sprites: {}, order: 'nope' }));
    expect(readCachedSprites(['cccccccccccccccc']).size).toBe(0);

    // And still works afterwards.
    const sprite = spriteOf('1');
    cacheSprites(new Map([['cccccccccccccccc', sprite]]));
    expect(readCachedSprites(['cccccccccccccccc']).get('cccccccccccccccc')).toBe(sprite);
  });

  it('does nothing when there is nothing to keep', () => {
    const before = window.localStorage.getItem(SPRITE_CACHE_KEY);
    cacheSprites(new Map());

    expect(window.localStorage.getItem(SPRITE_CACHE_KEY)).toBe(before);
  });

  /** ADR-228 — a face taken off is forgotten on this device, and no other. */
  it('forgets one face on this device, and keeps the others and their order', () => {
    const first = spriteOf('0');
    const second = spriteOf('1');
    const firstId = avatarSpriteId(first);
    const secondId = avatarSpriteId(second);
    cacheSprites(
      new Map([
        [firstId, first],
        [secondId, second],
      ]),
    );

    forgetCachedSprite(firstId);

    expect(readCachedSprites([firstId]).size).toBe(0);
    expect(readCachedSprites([secondId]).get(secondId)).toBe(second);
    const stored = JSON.parse(window.localStorage.getItem(SPRITE_CACHE_KEY) ?? '{}') as { order: string[] };
    expect(stored.order).toEqual([secondId]);
  });

  it('does nothing to the cache for a face it never held', () => {
    cacheSprites(new Map([[avatarSpriteId(spriteOf('0')), spriteOf('0')]]));
    const before = window.localStorage.getItem(SPRITE_CACHE_KEY);

    forgetCachedSprite('0000000000000000');

    expect(window.localStorage.getItem(SPRITE_CACHE_KEY)).toBe(before);
  });
});
