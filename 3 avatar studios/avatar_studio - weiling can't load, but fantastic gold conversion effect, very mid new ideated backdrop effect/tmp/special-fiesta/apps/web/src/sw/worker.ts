/**
 * ADR-147 — the service worker itself, built to `dist/sw.js` by `vite.sw.config.ts`.
 *
 * Deliberately the least interesting file in the feature. Every judgement it makes comes from
 * `policy.ts`, which is a pure module with tests; what is left here is plumbing against three
 * browser APIs that cannot be exercised in this repository's test environment at all. The
 * rule for anything added below: if it could be wrong, it belongs in `policy.ts`.
 *
 * It is installed only on facilitator devices, and only while a superadmin has station
 * offline mode switched on (`lib/sw/register.ts`). It never caches anything that is not
 * content-addressed, so it cannot serve stale data — it has no data.
 *
 * `__PSD_SHELL__` and `__PSD_BUILD__` are replaced at build time with the hashed asset URLs
 * of the bundle this worker shipped beside, and a hash of that list. A new deploy therefore
 * has a new cache name, and activation deletes every older one.
 */

import { cacheNameFor, routeFor, staleCacheNames } from './policy.js';
import { SKIP_WAITING_MESSAGE } from '../lib/sw/update.js';

declare const __PSD_SHELL__: string[];
declare const __PSD_BUILD__: string;

/*
 * Minimal local shapes for the three worker events used here. The alternative — pulling in
 * TypeScript's `webworker` lib — collides with the DOM lib the rest of this app is compiled
 * against, for four members.
 */
interface ExtendableEventLike {
  waitUntil(work: Promise<unknown>): void;
}
interface FetchEventLike extends ExtendableEventLike {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  addEventListener(type: string, listener: (event: Event) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
  caches: CacheStorage;
}

const scope = self as unknown as WorkerScope;
const CACHE = cacheNameFor(__PSD_BUILD__);

/** The shell: the one HTML document plus the hashed bundle it loads. No art (ADR-147 §B). */
const SHELL = ['/', ...__PSD_SHELL__];

async function precache(): Promise<void> {
  const cache = await scope.caches.open(CACHE);
  await cache.addAll(SHELL);
}

async function dropStaleCaches(): Promise<void> {
  const present = await scope.caches.keys();
  await Promise.all(
    staleCacheNames({ present, build: __PSD_BUILD__ }).map((name) => scope.caches.delete(name)),
  );
  await scope.clients.claim();
}

/**
 * Cache-first, and never revalidated: these URLs carry a content hash, so the copy in the
 * cache is the only copy that URL will ever have. A miss is fetched and kept.
 */
async function fromCacheFirst(request: Request): Promise<Response> {
  const cache = await scope.caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/**
 * A navigation is answered from the network when there is one, and from the precached shell
 * when there is not. Network-first rather than cache-first so that a deploy is picked up by
 * the next reload on a working connection — the offline copy is a fallback, not the normal
 * path.
 */
async function shellForNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await scope.caches.open(CACHE);
    const shell = await cache.match('/');
    if (shell) return shell;
    throw new Error('No shell cached');
  }
}

function handle(request: Request): Promise<Response> {
  const route = routeFor({
    url: new URL(request.url),
    origin: scope.location.origin,
    isNavigation: request.mode === 'navigate',
  });
  if (route === 'immutable') return fromCacheFirst(request);
  if (route === 'shell') return shellForNavigation(request);
  return fetch(request);
}

scope.addEventListener('install', (event) => {
  /*
   * No `skipWaiting()`. Swapping code under a running page yields a half-old app the moment
   * anything is lazily loaded, and a facilitator mid-scan is the worst possible moment to
   * find out. A new worker waits; the page that replaces it is the next cold start.
   */
  (event as unknown as ExtendableEventLike).waitUntil(precache());
});

scope.addEventListener('activate', (event) => {
  (event as unknown as ExtendableEventLike).waitUntil(dropStaleCaches());
});

/*
 * ADR-182 — stand down, but only when asked.
 *
 * The install handler above still refuses to `skipWaiting()` on its own, for the reason given
 * there. This listener is the exception and it is not a weakening of it: the message can only
 * come from `activateWaitingUpdate`, which only runs from a button a human pressed, and the
 * page reloads immediately afterwards. Nothing is swapped under anybody.
 */
scope.addEventListener('message', (event) => {
  const data = (event as unknown as { data?: { type?: string } }).data;
  if (data?.type === SKIP_WAITING_MESSAGE) void scope.skipWaiting();
});

scope.addEventListener('fetch', (event) => {
  const fetchEvent = event as unknown as FetchEventLike;
  if (fetchEvent.request.method !== 'GET') return;
  fetchEvent.respondWith(handle(fetchEvent.request));
});
