import { describe, expect, it } from 'vitest';
import { cacheNameFor, isImmutablePath, routeFor, staleCacheNames } from './policy.js';

/**
 * ADR-147 — the whole of the service worker's judgement, tested without a service worker.
 *
 * These are the assertions that stand in for the browser this repository cannot run. The
 * most important one is not any single case below: it is that `routeFor` answers
 * `network-only` for everything nobody has explicitly allowed, which is why the API appears
 * in this file only as a thing that must never be cached.
 */

const ORIGIN = 'https://day.example';
const ask = (path: string, mode: { isNavigation: boolean }) =>
  routeFor({ url: new URL(path, ORIGIN), origin: ORIGIN, isNavigation: mode.isNavigation });

const asset = { isNavigation: false };
const page = { isNavigation: true };

describe('service worker policy', () => {
  it('serves content-addressed paths from cache, for any venue theme', () => {
    for (const path of [
      '/assets/index-3f2a.js',
      '/themes/sentosa/motifs/trophy.svg',
      '/themes/sentosa/scene/panorama.png',
      '/themes/sentosa/scene-2x/panorama.png',
      '/themes/east-coast/motifs/trophy.svg',
    ]) {
      expect(ask(`${path}?v=096a2fb2`, asset), path).toBe('immutable');
    }
  });

  it('does not hold what is not content-addressed', () => {
    // scene-real is stamped with a build time and weighs 16 MB (ADR-201), and the old
    // unthemed URLs no longer exist.
    for (const path of [
      '/themes/sentosa/scene-real/panorama.jpg',
      '/themes/sentosa/other/thing.svg',
      '/themes/Sentosa/motifs/trophy.svg',
      '/motifs/trophy.svg',
      '/scene/panorama.png',
      '/index.html',
    ]) {
      expect(isImmutablePath(path), path).toBe(false);
    }
  });

  /*
   * The sabotage this guards: widening the policy to admit an API path. A worker-cached API
   * response is the one cache the server cannot purge, and `cacheStore.ts` already gives the
   * same warm-paint benefit under code that ships and can be revoked.
   */
  it('never caches the API, as a navigation or as a fetch', () => {
    expect(ask('/api/leaderboard', asset)).toBe('network-only');
    expect(ask('/api/me', asset)).toBe('network-only');
    expect(ask('/api/gallery/photos/abc/thumb?screen_key=secret', asset)).toBe('network-only');
  });

  it('never caches another origin, because an opaque response hides its own failure', () => {
    const fonts = new URL('https://fonts.googleapis.com/css2?family=VT323');
    expect(routeFor({ url: fonts, origin: ORIGIN, isNavigation: false })).toBe('network-only');
  });

  it('answers a page with the shell and a stray file with the network', () => {
    expect(ask('/staff/sync', page)).toBe('shell');
    expect(ask('/staff', page)).toBe('shell');
    // Not a navigation: an <img> whose file is missing must get a 404, never an HTML page.
    expect(ask('/favicon.ico', asset)).toBe('network-only');
    expect(ask('/sw.js', asset)).toBe('network-only');
  });

  /*
   * A path that merely *mentions* an allowed directory is not in it. `/assets/` as a prefix
   * is checked, not as a substring — `/api/assets/x` must not be mistaken for a bundle.
   */
  it('matches the allowlist as a prefix, not as a substring', () => {
    expect(ask('/api/assets/anything.js', asset)).toBe('network-only');
    expect(ask('/motifs-other/x.svg', asset)).toBe('network-only');
  });

  it('names a cache per build and sweeps every other one of ours', () => {
    expect(cacheNameFor('abc123')).toBe('psd-shell-abc123');
    const present = ['psd-shell-old1', 'psd-shell-abc123', 'some-other-app-cache'];
    expect(staleCacheNames({ present, build: 'abc123' })).toEqual(['psd-shell-old1']);
  });

  it('leaves a stranger\u2019s cache alone, even while cleaning up', () => {
    expect(staleCacheNames({ present: ['workbox-precache'], build: 'abc123' })).toEqual([]);
  });
});
