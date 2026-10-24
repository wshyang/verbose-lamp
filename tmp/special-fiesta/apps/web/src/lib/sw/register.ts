import type { AppShellPolicyView } from '@psd/contracts';
import { ourCacheNames } from '../../sw/policy.js';

/**
 * ADR-147 — whether this device should be holding a copy of the app shell, and acting on the
 * answer.
 *
 * All of the switch's intelligence lives here rather than in `worker.ts`, for one reason:
 * this file can be tested. A service worker cannot be exercised in jsdom at all, so the
 * decision to install one — and, far more importantly, the decision to **retire** one — is
 * made by ordinary page code with ordinary tests, and the worker is left with no opinion
 * about its own existence.
 *
 * Three facts decide it:
 *   1. the browser supports service workers at all;
 *   2. a superadmin has station offline mode switched on (`GET /api/app-shell-policy`);
 *   3. this page is a facilitator surface.
 *
 * Only (2) can turn a worker *off*, and it does so from any page, so a phone that wanders to
 * a participant screen still hears the switch.
 */

const POLICY_PATH = '/api/app-shell-policy';
const WORKER_PATH = '/sw.js';

/**
 * A tab at a station stays open for a whole shift, so \"checked at page load\" would mean a
 * kill switch that most phones never hear. Five minutes is the honest promise: flip the
 * switch at the console and every station phone with a working network has retired its
 * worker before you have finished explaining why.
 */
export const APP_SHELL_POLICY_POLL_MS = 300_000;

export type ShellOutcome =
  | 'unsupported'
  | 'unknown'
  | 'retired'
  | 'registered'
  | 'not-a-station'
  | 'failed';

/** `/staff` itself and everything under it; nothing else, including `/staffing` were it ever added. */
export function isStationPath(pathname: string): boolean {
  return pathname === '/staff' || pathname.startsWith('/staff/');
}

/**
 * `cache: 'no-store'` on the request as well as `no-store` on the response. The server's
 * header is the rule; this is the belt — a switch that can be answered from any cache at any
 * layer is not a switch.
 */
async function readPolicy(): Promise<boolean | null> {
  try {
    const response = await fetch(POLICY_PATH, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as AppShellPolicyView;
    return body.serveFromCache === true;
  } catch {
    return null;
  }
}

async function deleteOurCaches(): Promise<void> {
  if (!('caches' in globalThis)) return;
  const present = await caches.keys();
  await Promise.all(ourCacheNames(present).map((name) => caches.delete(name)));
}

/**
 * Unregister first, then empty the caches. In that order: a worker that is still controlling
 * the page can repopulate a cache it is serving from, and the window between the two is the
 * only moment that could happen.
 */
async function retire(container: ServiceWorkerContainer): Promise<void> {
  const registrations = await container.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  await deleteOurCaches();
}

/**
 * Reads the policy and makes this page obey it. Returns what it did, which is what the tests
 * assert on and what nothing in the product ever shows a human: a worker that has to be
 * explained to a facilitator has already failed.
 */
export async function applyAppShellPolicy(): Promise<ShellOutcome> {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const container = navigator.serviceWorker;
  const serveFromCache = await readPolicy();
  /*
   * An unreachable or unhappy server changes nothing. This is the fail-safe direction and it
   * is deliberately the *opposite* of fail-closed: the phone that cannot reach the policy is
   * usually the phone in the dead spot the worker exists for, and retiring it there would
   * take the feature away exactly when it is working.
   */
  if (serveFromCache === null) return 'unknown';
  if (!serveFromCache) {
    await retire(container);
    return 'retired';
  }
  if (!isStationPath(window.location.pathname)) return 'not-a-station';
  try {
    await container.register(WORKER_PATH);
    return 'registered';
  } catch {
    /*
     * A failed registration must be invisible. The app is exactly as correct with no worker
     * installed as with one — that is what makes withdrawal safe — so there is nothing to
     * report and nobody to report it to.
     */
    return 'failed';
  }
}

/**
 * Applies the policy now and keeps applying it. Returns the stop function; `main.tsx` never
 * calls it, because the only thing that ends this watch is the page going away.
 */
export function watchAppShellPolicy(): () => void {
  void applyAppShellPolicy();
  const timer = setInterval(() => void applyAppShellPolicy(), APP_SHELL_POLICY_POLL_MS);
  return () => clearInterval(timer);
}
