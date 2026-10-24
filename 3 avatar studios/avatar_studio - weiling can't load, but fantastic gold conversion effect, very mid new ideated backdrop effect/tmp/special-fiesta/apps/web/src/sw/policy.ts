/**
 * ADR-147 — what the service worker is allowed to do with a request, as a pure function.
 *
 * This module exists so that the *decision* can be tested and the *worker* can stay dumb. A
 * service worker cannot be unit-tested here — jsdom has no `ServiceWorkerGlobalScope`, no
 * Cache API and no navigation — so everything that could be got wrong is lifted out of
 * `worker.ts` and into a module with no browser APIs in it at all. `worker.ts` is then thin
 * enough to read in one screen, which is the other half of being auditable.
 *
 * The policy is an **allowlist, never a denylist**. Nothing is cached unless its URL is in a
 * directory whose filenames are content-addressed, which is why no route of this app's API
 * needs naming here — and why `check-standards.mjs` can enforce that none ever is. A
 * denylist would have to be updated every time a route was added; an allowlist is wrong only
 * if somebody deliberately widens it.
 */

export type Route = 'immutable' | 'shell' | 'network-only';

/**
 * The content-addressed paths `webStatic.ts` serves as `public, max-age=31536000, immutable`
 * (ADR-126): Vite's `/assets/`, and each venue theme's `/themes/<id>/{motifs,scene,scene-2x}/`
 * (ADR-294). Every URL under them carries a content hash — Vite's in the filename, the art's as
 * `?v={MOTIF_VERSION}` (ADR-014/067) — so a cached entry can never be *stale*: redrawn art
 * arrives under a URL no cache has ever seen. `scene-real` is absent on purpose: its stamp is a
 * build timestamp and the folder is 16 MB, so it is not something to keep for a year.
 *
 * This rule must stay in step with `isImmutablePath` in `apps/api/src/webStatic.ts`. A matcher
 * rather than a list, so a new venue's art is cached the day its directory exists.
 */
const IMMUTABLE_PATH = /^\/(?:assets\/|themes\/[a-z0-9-]+\/(?:motifs|scene|scene-2x)\/)/;

export function isImmutablePath(pathname: string): boolean {
  return IMMUTABLE_PATH.test(pathname);
}

/** Every cache this app has ever created is named from here, so a sweep can recognise them. */
const CACHE_PREFIX = 'psd-shell-';

export function cacheNameFor(build: string): string {
  return `${CACHE_PREFIX}${build}`;
}

/**
 * Which of the caches present now are this build's rubbish.
 *
 * One rule — anything of ours that is not the current name — rather than migration logic,
 * so a worker cannot accumulate generations. Caches belonging to other software on the same
 * origin are left alone; this app has none, and deleting a stranger's data because it was
 * nearby is how a cleanup becomes an incident.
 */
export function staleCacheNames(input: { present: readonly string[]; build: string }): string[] {
  const current = cacheNameFor(input.build);
  return ourCacheNames(input.present).filter((name) => name !== current);
}

/**
 * Every cache this app owns, which is what the kill switch deletes. Shared with
 * `lib/sw/register.ts` so that "ours" has one definition: a retirement that missed a cache
 * would leave a phone serving an app nobody can update.
 */
export function ourCacheNames(present: readonly string[]): string[] {
  return present.filter((name) => name.startsWith(CACHE_PREFIX));
}

/**
 * `isNavigation` is the request's own mode, read from `request.mode === 'navigate'`, not a
 * guess from the path: a page asking for itself is the only request that may be answered with
 * the shell, and an `<img>` for a missing file must never be handed an HTML document.
 */
export function routeFor(input: { url: URL; origin: string; isNavigation: boolean }): Route {
  /*
   * Cross-origin is network-only without exception. A worker cannot read the status of an
   * opaque response, so caching one means being unable to tell a 200 from a 404 — the stored
   * "asset" may be a captive portal's login page, kept forever. The Google Fonts stylesheet
   * is the live example on this origin's pages, and it is why offline paint is in the
   * fallback font until those two files are self-hosted.
   */
  if (input.url.origin !== input.origin) return 'network-only';
  if (isImmutablePath(input.url.pathname)) {
    return 'immutable';
  }
  return input.isNavigation ? 'shell' : 'network-only';
}
