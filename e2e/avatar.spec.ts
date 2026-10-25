import { expect, test, type Page } from '@playwright/test';
import { CANVAS } from './support/stage';

/**
 * The gilded avatar studio (ADDENDUM-022 §8, closed by ADDENDUM-030).
 *
 * Unlike the premiere's likeness suite, most of this needs no recorded baseline: the
 * preview canvas is written with `putImageData` from the CPU pipeline, so its pixels can be
 * read back and compared. The screenshots are the visual record; the digests are the
 * assertions that hold on any machine.
 *
 * Reduced motion pins the preview to the still frame — the same pixels the PNG writes — so
 * a shot is never a lottery between the sheen frames.
 *
 * The bundled `wei-ling.jpg` is the fixture: it is imported, so the single-file build inlines
 * it and it loads with no network at all.
 */
test.use({ reducedMotion: 'reduce' });

/** The model hosts the studio fetches at run time (`locateFace`, `segmentSubject`). */
const MODEL_HOSTS = ['**/cdn.jsdelivr.net/**', '**/storage.googleapis.com/**'];

/** `AVATAR_SIZE` in `features/avatar-studio/compose.ts`; the square the studio composes at. */
const AVATAR_SIZE = 512;
const TOTAL_PIXELS = AVATAR_SIZE * AVATAR_SIZE;

/** The finish chips in render order, from `SubjectControls`. */
const NATURAL = 0;
const GILDED = 2;
/** The frame chips in render order; the plaque is a filled square, the medallion is not. */
const PLAQUE = 1;

interface CanvasDigest {
  readonly width: number;
  readonly height: number;
  /** Pixels with alpha > 250 — subject, frame and backdrop, not the cut edge. */
  readonly opaque: number;
  /** Pixels where red leads blue by 20 or more: gold, by construction. */
  readonly gold: number;
  /** Distinct 15-bit colours seen, capped so the number is stable and cheap. */
  readonly distinct: number;
  /** FNV-1a over every channel, as hex. Equal hashes mean identical pixels. */
  readonly hash: string;
}

/**
 * Reads the preview canvas. `querySelector` rather than a locator because the whole
 * computation has to happen inside the page.
 */
async function digest(page: Page): Promise<CanvasDigest> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="avatar-studio__preview-canvas"]',
    );
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context || canvas.width === 0) {
      return { width: 0, height: 0, opaque: 0, gold: 0, distinct: 0, hash: '' };
    }

    const { width, height } = canvas;
    const { data } = context.getImageData(0, 0, width, height);
    const colours = new Set<number>();
    let opaque = 0;
    let gold = 0;
    let hash = 2166136261;

    for (let index = 0; index < data.length; index += 4) {
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a > 250) opaque += 1;
      if (r > b + 20 && r > 60) gold += 1;
      if (colours.size < 4096) colours.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));

      hash ^= r | (g << 8) | (b << 16) | (a << 24);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return { width, height, opaque, gold, distinct: colours.size, hash: hash.toString(16) };
  });
}

/**
 * Waits until two consecutive reads agree. Gilding 262k pixels in JavaScript takes seconds
 * on a software-rendered box, so a fixed sleep would sample a half-painted canvas.
 */
async function settled(page: Page): Promise<CanvasDigest> {
  let previous = await digest(page);
  await expect
    .poll(
      async () => {
        const current = await digest(page);
        const stable = current.hash === previous.hash && current.opaque > 0;
        previous = current;
        return stable;
      },
      { timeout: 90_000, intervals: [400, 400, 800, 1200] },
    )
    .toBe(true);
  return digest(page);
}

/**
 * Waits for the preview to leave `before` and then settle. The redraw runs on the main thread
 * behind the controls, so a settled read taken straight after a click can still be showing the
 * previous frame — the digest has to move before stability means anything.
 */
async function redrawn(page: Page, before: string): Promise<CanvasDigest> {
  await expect
    .poll(async () => (await digest(page)).hash, { timeout: 90_000, intervals: [300, 300, 600] })
    .not.toBe(before);
  return settled(page);
}

/** Opens the studio from the premiere and loads the bundled sample. */
async function openStudioWithSample(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator(`${CANVAS}[data-frame-ready="true"]`)).toBeAttached({ timeout: 90_000 });
  await page.getByTestId('avatar-studio__launch').click();
  await expect(page.getByTestId('avatar-studio__overlay')).toBeVisible();

  await page.getByTestId('avatar-studio__sample-wei-ling').click();

  // Without the face model the studio lands on the cropper holding the whole photo; with
  // it, the crop is already placed. Either way the crop is what the pipeline consumes.
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

const finishChip = (page: Page) => page.getByTestId('avatar-studio__subject-finish');
const frameChip = (page: Page) => page.getByTestId('avatar-studio__frame-shape');

test.describe('avatar studio, models offline', () => {
  test.beforeEach(async ({ page }) => {
    // Deliberately severed: the deterministic path is the pure-CPU one, and it is the one
    // that works on a machine with no network at all.
    for (const host of MODEL_HOSTS) await page.route(host, (route) => route.abort());
  });

  test('gilds the bundled sample and says so when the background cannot be lifted', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openStudioWithSample(page);

    // The contract the studio promises for a failed segmenter: plain words, one line.
    await expect(page.getByTestId('avatar-studio__state')).toContainText(
      /Background removed|background could not be removed/,
    );

    const first = await settled(page);
    expect(first.width).toBe(AVATAR_SIZE);
    expect(first.height).toBe(AVATAR_SIZE);
    // Offline there is no matte, so the full photo is in frame: the medallion leaves the
    // corners open, the photo covers the middle.
    expect(first.opaque).toBeGreaterThan(TOTAL_PIXELS * 0.5);
    expect(first.gold).toBeGreaterThan(first.opaque * 0.2);
    expect(first.distinct).toBeGreaterThan(512);

    // The same sample, twice, in two independent loads: the CPU pipeline is deterministic.
    await openStudioWithSample(page);
    const second = await settled(page);
    expect(second.hash).toBe(first.hash);
  });

  test('the finish and frame controls redraw the preview, and switching back restores it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
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
    test.setTimeout(300_000);
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
    test.setTimeout(300_000);
    await openStudioWithSample(page);
    await finishChip(page).nth(GILDED).click();
    await settled(page);
    await expect(page.getByTestId('avatar-studio__overlay')).toHaveScreenshot(
      'avatar-gilded-still.png',
      { timeout: 150_000 },
    );
  });
});

test.describe('avatar studio, models online', () => {
  /**
   * The cut-out path, which needs the face and segmentation models. It skips rather than
   * fails where those hosts are unreachable, so the suite still means something offline.
   */
  test('lifts the background off the bundled sample', async ({ page }) => {
    test.setTimeout(300_000);
    await openStudioWithSample(page);

    const state = page.getByTestId('avatar-studio__state');
    if (!/Background removed/.test((await state.textContent()) ?? '')) {
      test.skip(true, 'The segmentation model is unreachable, so there is no cut-out to shoot.');
    }

    const cut = await settled(page);
    // A real matte leaves the edges transparent where the medallion does not already.
    expect(cut.opaque).toBeLessThan(TOTAL_PIXELS * 0.6);

    await expect(page.getByTestId('avatar-studio__preview')).toHaveScreenshot(
      'avatar-cut-out.png',
      { timeout: 150_000 },
    );
  });
});
