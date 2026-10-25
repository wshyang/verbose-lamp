import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seeded, stamp } from '../support/fixtures.js';

/**
 * ADR-147 — station offline mode, end to end.
 *
 * **This spec has never been executed.** The sandbox that wrote it cannot run a browser: a
 * Chromium binary is obtainable there and hangs on launch (measured, `service-worker-plan.md`
 * §1.5). Every other test in this repository was watched failing before it was watched
 * passing; these were not, and that is the single reason station offline mode must be
 * rehearsed on real hardware before anybody switches it on at an event.
 *
 * Run it against a **built** deployment, not the Vite dev server: `dist/sw.js` only exists
 * after `npm run build:web`, and a worker is the one thing in this app whose behaviour in dev
 * is not evidence about production.
 *
 *   npm run build:web && npm start   # or the container
 *   PSD_E2E_BASE_URL=http://127.0.0.1:8787 npx playwright test e2e/service-worker.spec.ts
 *
 * Chromium only. WebKit's worker lifecycle across app switches is the residual risk this
 * feature carries into the day; Playwright's WebKit is not a phone and would give a
 * false reassurance about the one platform that worries us.
 */

async function signInSuperadmin(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/auth/superadmins/signin', {
    data: { username: seeded.superadmin.username, passcode: seeded.superadmin.passcode },
  });
  expect(response.ok()).toBe(true);
}

async function setStationOffline(request: APIRequestContext, to: 'enable' | 'disable') {
  const response = await request.post(`/api/admin/service-state/${to}-station-offline`, {
    data: {},
  });
  expect(response.ok()).toBe(true);
}

/** The worker installs after `load` and then has to activate; both are observable. */
async function waitForController(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 15_000,
  });
}

test.describe('station offline mode', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'worker lifecycle: chromium only');

  test.beforeEach(async ({ request }) => {
    await signInSuperadmin(request);
    await setStationOffline(request, 'disable');
  });

  /**
   * Journey 1 — the only justification the feature has. Write this first and watch it FAIL
   * with the switch off; if it passes with the switch off, it is measuring the HTTP cache and
   * not the worker.
   */
  test('a station page still paints after a reload with no network', async ({ page, request }) => {
    await setStationOffline(request, 'enable');
    await page.goto('/staff/signin');
    await waitForController(page);

    await page.context().setOffline(true);
    await page.reload();

    await expect(page.getByTestId('staff-signin__form')).toBeVisible();
    await page.screenshot({ path: `screenshots/${stamp()}-offline-station.png` });
    await page.context().setOffline(false);
  });

  /** The audience boundary, which is the whole reason the scope is what it is. */
  test('a participant page installs nothing, even with the switch on', async ({
    page,
    request,
  }) => {
    await setStationOffline(request, 'enable');
    await page.goto('/board');
    await page.waitForTimeout(3_000);

    const registrations = await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).length,
    );
    expect(registrations).toBe(0);
  });

  /**
   * Journey 3 — the kill switch, which is the control an operator is relying on. Note what
   * is NOT asserted: that an offline phone obeys. It cannot, and the panel says so.
   */
  test('flipping the switch off retires the worker and empties its caches', async ({
    page,
    request,
  }) => {
    await setStationOffline(request, 'enable');
    await page.goto('/staff/signin');
    await waitForController(page);
    expect(await page.evaluate(() => caches.keys())).not.toEqual([]);

    await setStationOffline(request, 'disable');
    await page.reload();

    await expect
      .poll(async () => page.evaluate(async () =>
        (await navigator.serviceWorker.getRegistrations()).length,
      ))
      .toBe(0);
    const remaining = await page.evaluate(() => caches.keys());
    expect(remaining.filter((name) => name.startsWith('psd-shell-'))).toEqual([]);
  });

  /** Nothing of the API may ever be answered from a cache, offline or on. */
  test('API reads still go to the network while the worker is installed', async ({
    page,
    request,
  }) => {
    await setStationOffline(request, 'enable');
    await page.goto('/staff/signin');
    await waitForController(page);

    const apiRequests: string[] = [];
    page.on('request', (item) => {
      if (item.url().includes('/api/')) apiRequests.push(item.url());
    });
    await page.reload();
    await waitForController(page);
    expect(apiRequests.length).toBeGreaterThan(0);

    // And offline, an API read FAILS rather than being answered from a stale copy.
    await page.context().setOffline(true);
    const failed = await page.evaluate(async () =>
      fetch('/api/health').then(() => 'answered', () => 'failed'),
    );
    expect(failed).toBe('failed');
    await page.context().setOffline(false);
  });

  /**
   * Journey 5 — the withdrawal rehearsal, and the one that must be run against a real
   * deploy. Delete `dist/sw.js`, redeploy, and the browser retires the worker on its next
   * update check because the script 404s (ADR-126). There is no automated form of this: it
   * requires changing what the server is serving mid-test, by hand, on purpose.
   */
  test.skip('deleting sw.js from a deploy retires the worker — rehearse by hand', () => {});
});
