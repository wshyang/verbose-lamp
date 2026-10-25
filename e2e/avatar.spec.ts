import { expect, test, type Page } from '@playwright/test';
import { redrawn, settled } from './support/canvasDigest';
import { severModelHosts, stubModelModules, TASKS_VISION_ROUTE, TRANSFORMERS_ROUTE } from './support/avatarModels';
import { gotoLive } from './support/stage';

/**
 * The gilded avatar studio.
 *
 * Most of this needs no recorded baseline: the preview is written from the CPU pipeline, so its
 * pixels are read back and compared (`canvasDigest`). The two stubbed-model screenshots are the
 * visual record. Reduced motion pins the preview to the still frame the PNG also writes, so a
 * shot is never a lottery between sheen frames.
 *
 * The bundled `wei-ling.jpg` is imported, so the single-file build inlines it and it loads with
 * no network at all.
 */
test.use({ reducedMotion: 'reduce' });

/** `AVATAR_SIZE` in `features/avatar-studio/compose.ts`: the square the studio composes at. */
const AVATAR_SIZE = 512;
const TOTAL_PIXELS = AVATAR_SIZE * AVATAR_SIZE;
const SLOW_MS = 300_000;

/** Chip positions in render order, from `SubjectControls`. */
const NATURAL = 0;
const GILDED = 2;
const PLAQUE = 1;

const finishChip = (page: Page) => page.getByTestId('avatar-studio__subject-finish');
const frameChip = (page: Page) => page.getByTestId('avatar-studio__frame-shape');

/** Opens the studio from the premiere and loads the bundled sample. */
async function openStudioWithSample(page: Page): Promise<void> {
  await gotoLive(page);
  await page.getByTestId('avatar-studio__launch').click({ force: true });
  await expect(page.getByTestId('avatar-studio__overlay')).toBeVisible();
  await page.getByTestId('avatar-studio__sample-wei-ling').click();
  await finishFraming(page);
}

/**
 * Without the face model the studio lands on the cropper holding the whole photo; with it, the
 * crop is already placed. Either way the crop is what the pipeline consumes.
 */
async function finishFraming(page: Page): Promise<void> {
  const confirm = page.getByTestId('avatar-studio__crop-confirm');
  const finished = /Background removed|background could not be removed|could not be used/;
  await expect
    .poll(
      async () => {
        if (await confirm.isVisible()) return 'crop';
        const message = await page.getByTestId('avatar-studio__state').textContent();
        return finished.test(message ?? '') ? 'ready' : 'waiting';
      },
      { timeout: 90_000, intervals: [300, 300, 600] },
    )
    .not.toBe('waiting');

  if (await confirm.isVisible()) await confirm.click();
  await expect(page.getByTestId('avatar-studio__preview-canvas')).toBeVisible();
  await expect(page.getByTestId('avatar-studio__adjust-framing')).toBeEnabled();
}

test.describe('avatar studio, models offline', () => {
  test.beforeEach(async ({ page }) => {
    await severModelHosts(page);
  });

  test('gilds the bundled sample and says so when the background cannot be lifted', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await openStudioWithSample(page);

    await expect(page.getByTestId('avatar-studio__state')).toContainText(
      /Background removed|background could not be removed/,
    );
    const first = await settled(page);
    expect(first.width).toBe(AVATAR_SIZE);
    expect(first.height).toBe(AVATAR_SIZE);
    // Offline there is no matte, so the full photo is in frame: the medallion leaves its corners
    // open, the photo covers the middle.
    expect(first.opaque).toBeGreaterThan(TOTAL_PIXELS * 0.5);
    expect(first.gold).toBeGreaterThan(first.opaque * 0.2);
    expect(first.distinct).toBeGreaterThan(512);

    // The same sample in an independent load: the CPU pipeline is deterministic.
    await openStudioWithSample(page);
    expect((await settled(page)).hash).toBe(first.hash);
  });

  test('the finish and frame controls redraw the preview, and switching back restores it', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await openStudioWithSample(page);
    const natural = await settled(page);

    await finishChip(page).nth(GILDED).click();
    const gilded = await redrawn(page, natural.hash);
    // Casting the subject in gold makes nearly everything in frame read as gold.
    expect(gilded.gold / gilded.opaque).toBeGreaterThan(natural.gold / natural.opaque);

    await finishChip(page).nth(NATURAL).click();
    const back = await redrawn(page, gilded.hash);
    expect(back.hash).toBe(natural.hash);
    expect(back.gold).toBe(natural.gold);

    await frameChip(page).nth(PLAQUE).click();
    const plaque = await redrawn(page, natural.hash);
    // A plaque fills the square; a medallion leaves its corners open.
    expect(plaque.opaque).toBeGreaterThan(natural.opaque);
    expect(plaque.opaque).toBe(TOTAL_PIXELS);
  });

  test('downloads the gilded still as a named PNG', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await openStudioWithSample(page);
    await finishChip(page).nth(GILDED).click();
    await settled(page);

    const download = page.waitForEvent('download', { timeout: 90_000 });
    await page.getByTestId('avatar-studio__download-png').click();
    const saved = await download;

    expect(saved.suggestedFilename()).toBe('wei-ling-gilded-avatar.png');
    expect(await saved.path()).toBeTruthy();
    await expect(page.getByTestId('avatar-studio__state')).not.toContainText('could not be prepared');
  });

  test('the gilded still', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await openStudioWithSample(page);
    await finishChip(page).nth(GILDED).click();
    await settled(page);

    await expect(page.getByTestId('avatar-studio__overlay')).toHaveScreenshot('avatar-gilded-still.png', {
      timeout: 150_000,
    });
  });
});

test.describe('avatar studio, models stubbed', () => {
  test.beforeEach(async ({ page }) => {
    await stubModelModules(page);
  });

  test('cuts the bundled sample out with the stand-in face and matte, then gilds it', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await gotoLive(page);
    await page.getByTestId('avatar-studio__launch').click({ force: true });
    await page.getByTestId('avatar-studio__sample-wei-ling').click();

    await expect(page.getByTestId('avatar-studio__state')).toHaveText(
      'Background removed. Move the square if the framing is off.',
      { timeout: 120_000 },
    );
    const cut = await settled(page);
    expect(cut.width).toBe(AVATAR_SIZE);
    // A medallion's corners stay open, so it is never the whole square (a plaque is).
    expect(cut.opaque).toBeGreaterThan(TOTAL_PIXELS * 0.5);
    expect(cut.opaque).toBeLessThan(TOTAL_PIXELS);

    const preview = page.getByTestId('avatar-studio__preview-canvas');
    await expect(preview).toHaveScreenshot('avatar-cut-out.png', { timeout: 120_000 });

    await finishChip(page).filter({ hasText: 'Gild subject' }).click();
    await redrawn(page, cut.hash);
    await expect(preview).toHaveScreenshot('avatar-cut-out-gilded.png', { timeout: 120_000 });
  });

  test('the matte changes the picture: the same sample without it draws different pixels', async ({ page }) => {
    test.setTimeout(SLOW_MS);
    await gotoLive(page);
    await page.getByTestId('avatar-studio__launch').click({ force: true });
    await page.getByTestId('avatar-studio__sample-wei-ling').click();
    await expect(page.getByTestId('avatar-studio__state')).toHaveText(
      'Background removed. Move the square if the framing is off.',
      { timeout: 120_000 },
    );
    const withMatte = await settled(page);

    // The same page, reloaded with the model hosts severed: same photo, same crop maths, no matte.
    // One page, not two: a second live WebGL scene starves the first on a CPU rasteriser.
    await page.unroute(TASKS_VISION_ROUTE);
    await page.unroute(TRANSFORMERS_ROUTE);
    await severModelHosts(page);
    await openStudioWithSample(page);
    const withoutMatte = await settled(page);

    expect(withMatte.hash).not.toBe(withoutMatte.hash);
  });
});
