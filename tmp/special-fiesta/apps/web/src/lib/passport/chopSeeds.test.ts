import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeItem } from '../storage/localStore.js';
import { CHOP_SEED_KEY, chopSeedFor, chopSeedsFor } from './chopSeeds.js';

/**
 * ADR-240 — the chop a station shows is decided once per device and kept there.
 *
 * These pin the promises a participant relies on: the same station shows the same seed on every
 * visit, a reload reads back what an earlier visit kept, and a browser that refuses to store
 * anything still shows one chop for as long as the page is open.
 */

function storedSeeds(): Record<string, number> {
  const raw = window.localStorage.getItem(CHOP_SEED_KEY);
  return raw === null ? {} : (JSON.parse(raw) as Record<string, number>);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  // localStore keeps a value in memory while the browser refuses it; forget it between cases.
  removeItem(CHOP_SEED_KEY);
});

describe('ADR-240 — the chop seed kept on the device', () => {
  it('keeps one seed per station and hands the same one back on every visit', () => {
    const first = chopSeedFor('station-visit');
    expect(chopSeedFor('station-visit')).toBe(first);
    expect(storedSeeds()['station-visit']).toBe(first);
  });

  it('draws a different seed for each station', () => {
    const seeds = ['station-one', 'station-two', 'station-three'].map((id) => chopSeedFor(id));
    expect(new Set(seeds).size).toBe(3);
  });

  it('reads back what an earlier visit kept, as after a reload of the page', async () => {
    const kept = chopSeedFor('station-reload');
    vi.resetModules();
    const reloaded = await import('./chopSeeds.js');
    expect(reloaded.chopSeedFor('station-reload')).toBe(kept);
  });

  it('starts again, rather than failing, when the stored value is not a map of seeds', () => {
    window.localStorage.setItem(CHOP_SEED_KEY, '{not json');
    const seed = chopSeedFor('station-garbled');
    expect(Number.isInteger(seed)).toBe(true);
    expect(storedSeeds()['station-garbled']).toBe(seed);
  });

  it('starts again when the stored value is a JSON value that is not an object', () => {
    window.localStorage.setItem(CHOP_SEED_KEY, '42');
    const seed = chopSeedFor('station-number');
    expect(Number.isInteger(seed)).toBe(true);
    expect(storedSeeds()['station-number']).toBe(seed);
  });

  it('drops a stored entry that is not a whole-number seed, and keeps only the new one', () => {
    window.localStorage.setItem(CHOP_SEED_KEY, JSON.stringify({ 'station-other': 'not a seed' }));
    const seed = chopSeedFor('station-other');
    expect(storedSeeds()).toEqual({ 'station-other': seed });
  });

  it('keeps one chop for the life of the page when the browser refuses to store it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const first = chopSeedFor('station-refused');
    expect(chopSeedFor('station-refused')).toBe(first);
  });
});

describe('ADR-261 — the seeds of repeat strikes at one station', () => {
  it('strikes first with the kept seed, then with a different derived seed each time', () => {
    const seeds = chopSeedsFor('station-regular', 4);
    expect(seeds).toHaveLength(4);
    expect(seeds[0]).toBe(chopSeedFor('station-regular'));
    expect(new Set(seeds).size).toBe(4);
    // What is stored did not change shape: still one number per station.
    expect(storedSeeds()).toEqual({ 'station-regular': seeds[0] });
  });

  it('derives the same stack on every visit, and none at an uncompleted station', () => {
    expect(chopSeedsFor('station-regular', 3)).toEqual(chopSeedsFor('station-regular', 3));
    expect(chopSeedsFor('station-regular', 0)).toEqual([]);
  });
});
