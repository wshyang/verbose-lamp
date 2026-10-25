import { beforeEach, describe, expect, it } from 'vitest';
import { readItem, removeItem, writeItem } from './localStore.js';
import { hasStoredVenue, readStoredVenue, writeStoredVenue } from './venueStore.js';

const KEY = 'psd.venue.v1';

describe('venue store (ADR-295)', () => {
  beforeEach(() => removeItem(KEY));

  it('falls back to the default venue when nothing has been stored', () => {
    expect(readStoredVenue()).toBe('sentosa');
  });

  it('reads back what was written', () => {
    writeStoredVenue('sentosa');

    expect(readItem(KEY)).toBe('sentosa');
    expect(readStoredVenue()).toBe('sentosa');
  });

  it('ignores a stored venue this build does not contain', () => {
    // An id retired between deploys, or a hand-edited key: a theme the build lacks would render
    // nothing, so the default wins rather than the stale value.
    writeItem(KEY, 'atlantis');

    expect(readStoredVenue()).toBe('sentosa');
  });

  it('ignores an empty stored value', () => {
    writeItem(KEY, '');

    expect(readStoredVenue()).toBe('sentosa');
  });

  it('writes only a change, so confirming the same venue touches no storage', () => {
    writeStoredVenue('sentosa');
    let writes = 0;
    const original = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (key: string, value: string) => {
      writes += 1;
      original(key, value);
    };

    try {
      writeStoredVenue('sentosa');
    } finally {
      window.localStorage.setItem = original;
    }

    expect(writes).toBe(0);
  });

  it('says whether a recognised venue is stored, which reading the default cannot', () => {
    expect(hasStoredVenue()).toBe(false);

    writeItem(KEY, 'atlantis');
    expect(hasStoredVenue()).toBe(false);

    writeItem(KEY, '');
    expect(hasStoredVenue()).toBe(false);

    writeStoredVenue('sentosa');
    expect(hasStoredVenue()).toBe(true);
    // The default venue stored on purpose is still "stored": a returning Sentosa phone must not wait.
    expect(readStoredVenue()).toBe('sentosa');
  });
});
