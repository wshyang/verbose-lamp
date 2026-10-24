import type { GalleryRendition } from '@psd/contracts';
import { readSessionToken } from '../session/tokenStore.js';
import { readScreenKey } from '../session/screenKeyStore.js';

/**
 * Where a gallery photo's bytes live (ADR-047).
 *
 * This is deliberately NOT in `lib/api/`: it builds a string for an `<img src>`, it makes no
 * request, and a component may therefore use it directly — whereas importing `lib/api` from a
 * component or a route is a standards violation, and rightly so.
 *
 * ADR-103 — the credential rides in the query string when the app holds one. An `<img>`
 * request can carry cookies but never the private header the fetch layer falls back to
 * (ADR-016), so in the embedded case — where the browser refuses this app's cookie — every
 * image would 401 into a broken-link icon while the JSON around it loads fine. The server
 * already accepts the query carrier for exactly this reason.
 *
 * ADR-140/143 — the same reasoning gives the hall screen's key a seat here, and for the
 * screen it is not a fallback but the only road: a projector holds no session and no cookie,
 * so without the key every photo on the wall would 401 into a broken-image glyph three metres
 * wide. The renditions are on the screen key's six-read allowlist precisely for this.
 *
 * The id is a UUIDv7 and a photo never changes after upload, so the URL stays a stable cache
 * key for the session; `immutable` caching still holds per signed-in browser.
 */
export function galleryImageUrl(photoId: string, rendition: GalleryRendition): string {
  const base = `/api/gallery/photos/${photoId}/${rendition}`;
  /*
   * Hand-encoded rather than through `URLSearchParams`, which writes a space as `+`. Both
   * spellings are legal in a query string and the two sides do not have to agree about them;
   * `encodeURIComponent` produces the one this app has always sent.
   */
  const carried = [
    ['session_token', readSessionToken()],
    ['screen_key', readScreenKey()],
  ].filter((pair): pair is [string, string] => pair[1] !== null);
  if (carried.length === 0) return base;
  return `${base}?${carried.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}`;
}
