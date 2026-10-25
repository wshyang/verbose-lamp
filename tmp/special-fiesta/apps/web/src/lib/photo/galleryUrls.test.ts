import { beforeEach, describe, expect, it } from 'vitest';
import { galleryImageUrl } from './galleryUrls.js';
import { clearSessionToken, writeSessionToken } from '../session/tokenStore.js';
import { clearScreenKey, writeScreenKey } from '../session/screenKeyStore.js';

/**
 * ADR-103 — an <img> can carry cookies but never the fetch layer's private header, so when
 * the app holds a token (the embedded case where cookies are refused) the image URL must
 * carry it in the query string — or every photo renders as a broken-link icon while the
 * JSON around it loads fine.
 */

beforeEach(() => {
  window.localStorage.clear();
  clearSessionToken();
  clearScreenKey();
});

describe('galleryImageUrl', () => {
  it('is a bare immutable URL while the cookie is doing the work', () => {
    expect(galleryImageUrl('p1', 'thumb')).toBe('/api/gallery/photos/p1/thumb');
  });

  it('rides the query carrier when the app is holding a session token', () => {
    writeSessionToken('tok en+1');
    expect(galleryImageUrl('p1', 'full')).toBe(
      '/api/gallery/photos/p1/full?session_token=tok%20en%2B1',
    );
  });

  it('carries the hall screen key, which is the only credential a projector has', () => {
    writeScreenKey('scr-1');
    // Without this every photo on the wall is a broken-image glyph three metres wide: a
    // projector holds no cookie and no session, and an <img> cannot send a header (ADR-140).
    expect(galleryImageUrl('p1', 'thumb')).toBe('/api/gallery/photos/p1/thumb?screen_key=scr-1');
  });
});
