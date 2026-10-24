import { readFileSync } from 'node:fs';
import { expect, test, type Browser } from '@playwright/test';
import { apiSignUp, signInParticipant, signInSuperadmin, unique, stamp } from '../support/fixtures.js';
import { busyPhoto } from '../support/photo-stubs.js';
import { oversizedNoisePng } from '../support/oversized-png.js';

/**
 * The photo gallery, end to end (ADR-047).
 *
 * This is the only test that exercises the whole chain as a participant actually meets it: a real
 * file chosen in a real file input, shrunk by a real canvas in a real browser, uploaded as real
 * multipart, written to a real directory, and streamed back as a real image the page displays.
 *
 * The `images/ingest/` corpus is reused as fixture material — it is already in the repo for the
 * avatar suites, and its files are PNG, which is exactly the case worth covering: what leaves the
 * browser must be WebP or JPEG, because the shrink step is also the format normaliser.
 *
 * Chromium only. What this proves is the canvas encode plus the multipart round trip; the engines
 * do not differ on `FormData`, and `shrinkPhoto`'s WebP-or-JPEG decision is unit-tested.
 */

/**
 * A real corpus photo, made unique for this run (ADR-050).
 *
 * The gallery deduplicates globally on the SHA-1 of the raw original, so a test that uploads the
 * same fixture twice is correctly refused the second time — including across runs against a
 * database that persists, which is exactly what caught this. Trailing bytes after a PNG's IEND
 * chunk are ignored by every decoder, so this stays a genuine, browser-decodable PNG while hashing
 * differently on every run.
 *
 * Passing a buffer rather than a path is also what lets the filename vary, and the filename is
 * what the archive stores.
 */
function uniquePhoto(index: number) {
  const original = readFileSync(busyPhoto(index));
  const salt = Buffer.from(`psd-e2e-${Date.now()}-${Math.random()}`);
  return {
    name: `IMG_${Date.now()}_${index}.png`,
    mimeType: 'image/png',
    buffer: Buffer.concat([original, salt]),
  };
}

/**
 * A file deliberately past the 12 MB archive cap, and different on every call (ADR-052).
 *
 * `oversized-png.ts` explains why this is generated noise rather than a padded corpus photo: an
 * oversized original is archived as a RE-ENCODED copy, so a file that merely has filler appended
 * decodes — and therefore re-encodes — identically every run, and ADR-050's duplicate check quite
 * correctly refuses it the second time.
 */
function oversizedPhoto() {
  return {
    name: `IMG_BIG_${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: oversizedNoisePng(),
  };
}

test.describe('the photo gallery', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Proves the canvas encode and multipart round trip once; engines do not differ on FormData.',
  );

  /**
   * Staff surfaces get their own browser context rather than re-signing-in the participant's.
   *
   * Signing a superadmin in over a live participant session leaves the app holding the
   * participant's token, and `RequireActor` then bounces the admin route back to the
   * participant's home — which is what happened before this was split, and is a realistic
   * mistake to guard against rather than a test artefact.
   */
  async function asSuperadmin(browser: Browser, visit: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInSuperadmin(page);
    await page.goto(visit);
    return { page, close: () => context.close() };
  }

  test('a shared photo appears in the grid, can be liked, and reaches the wall', async ({
    browser,
    page,
    request,
  }) => {
    const nickname = unique('Shutter');
    await apiSignUp(request, { nickname });
    await signInParticipant(page, nickname, '1234');

    await page.goto('/social/photos');
    await expect(page.getByTestId('photos-panel__pick')).toBeAttached();

    // Nothing picked yet, so sharing is not offered.
    await expect(page.getByTestId('photos-panel__share')).toBeDisabled();

    const caption = `beach day ${stamp()}`;
    await page.getByTestId('photos-panel__pick').setInputFiles(uniquePhoto(0));
    await page.getByTestId('photos-panel__caption').fill(caption);
    await expect(page.getByTestId('photos-panel__share')).toBeEnabled();
    await page.getByTestId('photos-panel__share').click();

    // It is in the grid, and its thumb really loaded — `naturalWidth` is zero for a broken
    // image, so this is the assertion that the bytes made the whole round trip.
    const photo = page.getByTestId('photos-panel__photo').filter({ hasText: caption });
    await expect(photo).toBeVisible({ timeout: 20_000 });
    const thumb = photo.locator('img');
    await expect(thumb).toBeVisible();
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    await page.screenshot({ path: `screenshots/ft-gallery-grid-${stamp()}.png` });

    // Liking is a toggle and the count follows it.
    const like = photo.getByTestId('photos-panel__like');
    await expect(like).toContainText('0');
    await like.click();
    await expect(like).toContainText('1', { timeout: 15_000 });
    await like.click();
    await expect(like).toContainText('0', { timeout: 15_000 });

    // Liked once more so the wall has something top-ranked to show.
    await like.click();
    await expect(like).toContainText('1', { timeout: 15_000 });

    // The wall is a superadmin surface, so it gets its own context.
    const wall = await asSuperadmin(browser, '/admin/wall');
    try {
      const wallImage = wall.page.locator('.console-wall-image');
      await expect(wallImage).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(() => wallImage.evaluate((img) => (img as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await wall.page.screenshot({ path: `screenshots/ft-photo-wall-${stamp()}.png` });
    } finally {
      await wall.close();
    }
  });

  /**
   * Desktop viewports only, and that is a product fact rather than a convenience: the superadmin
   * console is a dense laptop surface (fds.md §5.5), and at a 412 px phone width its sticky
   * header overlaps the table it is meant to sit above. Asserting a console workflow on a phone
   * would be testing a configuration nobody runs the event from.
   *
   * Note this needs `isMobile`, not `browserName`: a Pixel 7 project is still Chromium, so a
   * browser-name skip does not exclude it.
   */
  test('fits an oversized original under the cap instead of refusing it', async ({
    browser,
    isMobile,
    page,
    request,
  }) => {
    // Its last act checks the superadmin console, which is a laptop surface (see the note below).
    test.skip(isMobile === true, 'The superadmin console is a laptop surface, not a phone one.');
    const nickname = unique('Huge');
    await apiSignUp(request, { nickname });
    await signInParticipant(page, nickname, '1234');

    const caption = `oversized ${stamp()}`;
    await page.goto('/social/photos');
    // 13 MB+ — past the archive cap, so ADR-052's ladder has to earn its keep in a real browser
    // with the real canvas encoder, which no unit test can stand in for.
    await page.getByTestId('photos-panel__pick').setInputFiles(oversizedPhoto());
    await page.getByTestId('photos-panel__caption').fill(caption);
    await page.getByTestId('photos-panel__share').click();

    // Shared rather than rejected: the user was never asked to go and resize it themselves.
    const photo = page.getByTestId('photos-panel__photo').filter({ hasText: caption });
    await expect(photo).toBeVisible({ timeout: 40_000 });
    const thumb = photo.locator('img');
    await expect
      .poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0);

    // And the console says the archive is a resized copy, not a pristine original.
    const admin = await asSuperadmin(browser, '/admin/photos');
    try {
      const row = admin.page.getByTestId('gallery-moderation__row').filter({ hasText: caption });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.getByTestId('gallery-moderation__archive')).toHaveText('resized');
      await admin.page.screenshot({ path: `screenshots/ft-gallery-oversized-${stamp()}.png` });
    } finally {
      await admin.close();
    }
  });

  test('a superadmin can hide a photo and put it back', async ({ browser, isMobile, page, request }) => {
    test.skip(isMobile === true, 'The superadmin console is a laptop surface, not a phone one.');

    const nickname = unique('Snap');
    await apiSignUp(request, { nickname });
    await signInParticipant(page, nickname, '1234');

    const caption = `to be hidden ${stamp()}`;
    await page.goto('/social/photos');
    await page.getByTestId('photos-panel__pick').setInputFiles(uniquePhoto(1));
    await page.getByTestId('photos-panel__caption').fill(caption);
    await page.getByTestId('photos-panel__share').click();
    await expect(page.getByTestId('photos-panel__photo').filter({ hasText: caption })).toBeVisible({
      timeout: 20_000,
    });

    const admin = await asSuperadmin(browser, '/admin/photos');
    try {
      const row = admin.page.getByTestId('gallery-moderation__row').filter({ hasText: caption });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.getByTestId('gallery-moderation__state')).toHaveText('visible');

      await row.getByTestId('gallery-moderation__hide').click();
      await expect(row.getByTestId('gallery-moderation__state')).toHaveText('hidden', {
        timeout: 15_000,
      });

      await admin.page.screenshot({ path: `screenshots/ft-gallery-moderation-${stamp()}.png` });

      // Reversible, which is the point of a soft hide.
      await row.getByTestId('gallery-moderation__unhide').click();
      await expect(row.getByTestId('gallery-moderation__state')).toHaveText('visible', {
        timeout: 15_000,
      });
    } finally {
      await admin.close();
    }
  });
});
