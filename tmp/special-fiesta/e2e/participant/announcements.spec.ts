import { expect, test, type Page } from '@playwright/test';
import {
  apiSignUp,
  clearAnnouncements,
  signInParticipant,
  signInSuperadmin,
  stamp,
  unique,
} from '../support/fixtures.js';

/**
 * Staff announcements, end to end (ADR-074).
 *
 * The feature shipped with six API tests and six component tests, and neither layer can reach what
 * this spec is for: an announcement crosses two *different* actor languages — a superadmin types it
 * into a dense console table, a participant receives it as a toast over a Gameboy banner — and its
 * dismissal lives in `localStorage`, which only a real browser navigation can prove survives.
 *
 * **Announced before the participant signs in, every time.** Alerts arrive on the jittered 45-75 s
 * poll (ADR-024), so waiting for a tick would make this spec slow and flaky for no gain. A fresh
 * mount fetches `/api/me/alerts` immediately, so ordering the steps this way is what keeps it quick.
 * Where a page is already open, it reloads rather than waits.
 *
 * Chromium only, for the same reason as `chat.spec.ts`: what this exercises — a fetch on mount and a
 * `localStorage` round trip — does not differ between engines, and the four projects (ADR-043) run
 * `workers: 1`, so the other three would cost minutes to re-prove one code path.
 */

/** Keeps each announcement's text unique per run, so no assertion can match a leftover row. */
function runStamp(): string {
  return Math.random().toString(36).slice(-5);
}

/*
 * `clearAnnouncements` lives in support/fixtures.js now (ADR-347): the cast specs need the
 * same oldest-live-row guarantee before they announce. Its doc comment moved with it.
 */

/** Announces through the real console UI, and waits for the row that proves the write landed. */
async function announce(page: Page, body: string): Promise<void> {
  await signInSuperadmin(page);
  await page.goto('/admin/announce');
  await page.getByTestId('announce__body').fill(body);
  await page.getByTestId('announce__send').click();
  await expect(page.getByTestId('announce__row').filter({ hasText: body })).toBeVisible({
    timeout: 20_000,
  });
}

/** A signed-in participant on a surface that carries the shell, which is where a toast appears. */
async function participantOn(page: Page, nickname: string): Promise<void> {
  await signInParticipant(page, nickname, '1234');
  await expect(page.getByTestId('gameboy-shell__nav-link').first()).toBeVisible();
}

test.describe('staff announcements', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'A fetch on mount and a localStorage round trip do not differ between engines.',
  );

  test('an announcement reaches a participant as a toast over the app', async ({
    browser,
    request,
  }) => {
    await clearAnnouncements(request);
    const body = `finals start at 4pm on court 1 ${runStamp()}`;
    const nickname = unique('Listener');
    await apiSignUp(request, { nickname });

    const adminContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      await announce(await adminContext.newPage(), body);

      const page = await participantContext.newPage();
      await participantOn(page, nickname);

      await expect(page.getByTestId('announcement-toast')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('announcement-toast__body')).toHaveText(body);
      // Over the app, not instead of it — the nav is still there underneath.
      await expect(page.getByTestId('gameboy-shell__nav-link').first()).toBeVisible();

      await page.screenshot({ path: `screenshots/ft-announce-toast-${stamp()}.png` });
    } finally {
      await adminContext.close();
      await participantContext.close();
    }
  });

  test('a tap dismisses it, and a reload does not bring it back', async ({ browser, request }) => {
    await clearAnnouncements(request);
    const body = `hydrate, it is very hot out here ${runStamp()}`;
    const nickname = unique('Tapper');
    await apiSignUp(request, { nickname });

    const adminContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      await announce(await adminContext.newPage(), body);

      const page = await participantContext.newPage();
      await participantOn(page, nickname);
      const toast = page.getByTestId('announcement-toast');
      await expect(toast).toBeVisible({ timeout: 20_000 });

      await toast.click();
      await expect(toast).toBeHidden();

      /*
       * The reload is the assertion. The component test already proves an unmount and remount inside
       * one JS realm; only a real navigation proves the id reached
       * `psd.announcements.floor.v1` (ADR-082) and is read back out of it — while the server is still
       * offering the announcement on every poll.
       */
      await page.reload();
      await expect(page.getByTestId('gameboy-shell__nav-link').first()).toBeVisible();
      await expect(toast).toBeHidden();

      await page.screenshot({ path: `screenshots/ft-announce-dismiss-${stamp()}.png` });
    } finally {
      await adminContext.close();
      await participantContext.close();
    }
  });

  test('dismissal is per browser, so a second device still shows it', async ({
    browser,
    request,
  }) => {
    await clearAnnouncements(request);
    const body = `prize table is filling up ${runStamp()}`;
    const first = unique('FirstDevice');
    const second = unique('SecondDevice');
    await apiSignUp(request, { nickname: first });
    await apiSignUp(request, { nickname: second });

    const adminContext = await browser.newContext();
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      await announce(await adminContext.newPage(), body);

      const firstPage = await firstContext.newPage();
      await participantOn(firstPage, first);
      await firstPage.getByTestId('announcement-toast').click();
      await expect(firstPage.getByTestId('announcement-toast')).toBeHidden();

      /*
       * ADR-074 accepted this cost explicitly — "a second device shows the toast again" — as the
       * price of a live read identical for every participant, and therefore cacheable. It is
       * asserted rather than merely tolerated so a future move back to server-side dismissal cannot
       * land without somebody deciding to change this line.
       */
      const secondPage = await secondContext.newPage();
      await participantOn(secondPage, second);
      await expect(secondPage.getByTestId('announcement-toast')).toBeVisible({ timeout: 20_000 });
      await expect(secondPage.getByTestId('announcement-toast__body')).toHaveText(body);

      await secondPage.screenshot({ path: `screenshots/ft-announce-per-browser-${stamp()}.png` });
    } finally {
      await adminContext.close();
      await firstContext.close();
      await secondContext.close();
    }
  });

  test('retracting it takes the toast away from someone who never dismissed it', async ({
    browser,
    request,
  }) => {
    await clearAnnouncements(request);
    const body = `ignore that, the final moved ${runStamp()}`;
    const nickname = unique('Waiter');
    await apiSignUp(request, { nickname });

    const adminContext = await browser.newContext();
    const participantContext = await browser.newContext();
    try {
      const adminPage = await adminContext.newPage();
      await announce(adminPage, body);

      const page = await participantContext.newPage();
      await participantOn(page, nickname);
      await expect(page.getByTestId('announcement-toast')).toBeVisible({ timeout: 20_000 });

      /*
       * Waited on the response, because the console row is NOT expected to disappear: retraction is
       * a soft hide, and ADR-074 keeps the row listed for the audit trail. `listAnnouncements`
       * returns retracted rows and `announcementView` carries no `retractedAt`, so the table cannot
       * show the difference — the write itself is the only observable signal here.
       */
      const row = adminPage.getByTestId('announce__row').filter({ hasText: body });
      const retracted = adminPage.waitForResponse(
        (response) => response.url().includes('/retract') && response.status() === 200,
      );
      await row.getByTestId('announce__retract').click();
      await retracted;
      // Still on the console, deliberately: gone from every reader, kept for whoever asks later.
      await expect(row).toBeVisible();

      // Reloaded rather than waited out: a retraction reaches the participant on the next read.
      await page.reload();
      await expect(page.getByTestId('gameboy-shell__nav-link').first()).toBeVisible();
      await expect(page.getByTestId('announcement-toast')).toBeHidden();

      await page.screenshot({ path: `screenshots/ft-announce-retract-${stamp()}.png` });
    } finally {
      await adminContext.close();
      await participantContext.close();
    }
  });
});
