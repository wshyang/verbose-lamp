import { beforeEach, describe, expect, it } from 'vitest';
import { removeItem, writeItem } from '../lib/storage/localStore.js';
import { applyStoredVenue, applyVenueToDocument } from './applyVenue.js';
import { themeFor } from './index.js';

const KEY = 'psd.venue.v1';

function meta(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (element === null) {
    element = document.createElement('meta');
    element.name = 'theme-color';
    document.head.append(element);
  }
  return element;
}

describe('applying a venue to the document (ADR-298)', () => {
  beforeEach(() => {
    removeItem(KEY);
    delete document.documentElement.dataset['venue'];
    meta().content = '';
  });

  it('sets <html data-venue> and the browser chrome colour from the theme', () => {
    applyVenueToDocument(themeFor('sentosa'));

    expect(document.documentElement.dataset['venue']).toBe('sentosa');
    expect(meta().content).toBe(themeFor('sentosa').metaThemeColor);
  });

  it('applies the venue this browser last heard of, before any component renders', () => {
    writeItem(KEY, 'sentosa');

    const applied = applyStoredVenue();

    expect(applied.id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
    expect(meta().content).toBe('#2f7dd1');
  });

  it('falls back to the default venue when nothing, or something unknown, was stored', () => {
    expect(applyStoredVenue().id).toBe('sentosa');

    writeItem(KEY, 'atlantis');

    expect(applyStoredVenue().id).toBe('sentosa');
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
  });

  it('does not throw when the page has no theme-color meta', () => {
    document.querySelector('meta[name="theme-color"]')?.remove();

    expect(() => applyVenueToDocument(themeFor('sentosa'))).not.toThrow();
    expect(document.documentElement.dataset['venue']).toBe('sentosa');
  });
});
