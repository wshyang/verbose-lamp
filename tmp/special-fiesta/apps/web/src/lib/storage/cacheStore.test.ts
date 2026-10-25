import { beforeEach, describe, expect, it } from 'vitest';
import {
  DATA_CACHE_KEY,
  invalidateCached,
  invalidateCachedPrefix,
  purgeAllCached,
  readCached,
  writeCached,
} from './cacheStore.js';

/**
 * ADR-112 — the device cache contract: actor-namespaced, age-capped, LRU under a byte
 * budget, and gone entirely on purge. jsdom's localStorage is the real store here.
 */

const HOUR = 60 * 60 * 1000;

beforeEach(() => window.localStorage.clear());

describe('cacheStore (ADR-112)', () => {
  it('round-trips an answer for the actor who fetched it — and ONLY them', () => {
    writeCached('teams.mine', 'alice', { team: 'Sandstorm' });
    expect(readCached('teams.mine', 'alice', HOUR)?.data).toEqual({ team: 'Sandstorm' });
    // The same name under another actor is a miss, never a leak.
    expect(readCached('teams.mine', 'bob', HOUR)).toBeNull();
  });

  it('refuses an answer older than the horizon asked for', () => {
    writeCached('me', 'alice', { nickname: 'Wei_Ling' });
    expect(readCached('me', 'alice', 0)).toBeNull();
    expect(readCached('me', 'alice', HOUR)).not.toBeNull();
  });

  it('invalidates one name across every actor', () => {
    writeCached('teams.mine', 'alice', 1);
    writeCached('teams.mine', 'bob', 2);
    writeCached('me', 'alice', 3);
    invalidateCached('teams.mine');
    expect(readCached('teams.mine', 'alice', HOUR)).toBeNull();
    expect(readCached('teams.mine', 'bob', HOUR)).toBeNull();
    expect(readCached('me', 'alice', HOUR)?.data).toBe(3);
  });

  it('invalidates a parameterised cache family across every actor', () => {
    writeCached('teams.detail.team-a', 'alice', 1);
    writeCached('teams.detail.team-b', 'bob', 2);
    writeCached('teams.mine', 'alice', 3);
    invalidateCachedPrefix('teams.detail.');
    expect(readCached('teams.detail.team-a', 'alice', HOUR)).toBeNull();
    expect(readCached('teams.detail.team-b', 'bob', HOUR)).toBeNull();
    expect(readCached('teams.mine', 'alice', HOUR)?.data).toBe(3);
  });

  it('keeps a recently-read answer when the LRU budget evicts a colder one', () => {
    const bulky = 'x'.repeat(60_000);
    writeCached('one', 'alice', bulky);
    writeCached('two', 'alice', bulky);
    writeCached('three', 'alice', bulky);
    writeCached('four', 'alice', bulky);
    // One becomes newest by USE, rather than by write time.
    expect(readCached('one', 'alice', HOUR)).not.toBeNull();
    writeCached('five', 'alice', bulky);
    expect(readCached('two', 'alice', HOUR)).toBeNull();
    expect(readCached('one', 'alice', HOUR)).not.toBeNull();
    expect(readCached('five', 'alice', HOUR)).not.toBeNull();
  });

  it('purges everything in one stroke, and shrugs at a corrupt file', () => {
    writeCached('me', 'alice', 1);
    purgeAllCached();
    expect(readCached('me', 'alice', HOUR)).toBeNull();

    window.localStorage.setItem(DATA_CACHE_KEY, 'not json {{');
    expect(readCached('me', 'alice', HOUR)).toBeNull();
    writeCached('me', 'alice', 2);
    expect(readCached('me', 'alice', HOUR)?.data).toBe(2);
  });
});
