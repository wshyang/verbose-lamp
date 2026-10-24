import { parseAvatarSprite } from '@psd/contracts';
import { expect, test } from '@playwright/test';
import { stamp } from '../support/fixtures.js';
import {
  busyPhoto,
  CDN,
  FAKE_FACE_DETECTOR,
  FAKE_TRANSFORMERS,
  HINTS,
  mediapipe,
  openStudio,
  savedSprite,
  useSquare,
} from '../support/photo-stubs.js';

/**
 * ADR-073 — the cut-out controls, driven through the real studio.
 *
 * What this proves is that the controls are wired: a tap changes the tuning, changes the preview,
 * and changes what is saved. What it cannot prove is that the *prune* is right — the stand-in matte
 * is a single ellipse with no detached pieces to drop, so there is nothing here for "Remove" to
 * remove. That correctness lives in `apps/web/src/lib/avatar/cutOut.test.ts` (planted islands) and
 * `seedIslands.test.ts` (the recorded crowd, with real mattes behind it). Stating the division out
 * loud because ADR-054 was shipped on a suite that passed while defending a defect.
 */

test.use({ video: 'off' });

test.describe('tuning the cut-out (ADR-072/073)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({ body: FAKE_TRANSFORMERS, contentType: 'text/javascript' }),
    );
    await page.addInitScript(FAKE_FACE_DETECTOR);
    await mediapipe(page, 'found');
  });

  test('offers the three knobs, and a turned knob changes the saved sprite', async ({ page }) => {
    await openStudio(page, 'Tuner');
    await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(0));
    await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.refined, {
      timeout: 30_000,
    });

    await expect(page.getByTestId('cut-out-controls')).toBeVisible();
    await expect(page.getByTestId('cut-out-controls__preview')).toBeVisible();

    // With a matte there are three rows; the cut-out row is the one that needs one.
    await expect(page.getByTestId('cut-out-controls__threshold')).toHaveCount(3);
    await expect(page.getByTestId('cut-out-controls__minIsland')).toHaveCount(2);
    await expect(page.getByTestId('cut-out-controls__edge')).toHaveCount(3);

    // "Remove" is the default, so "Keep" is the choice that is not currently pressed.
    const keep = page.getByTestId('cut-out-controls__minIsland').first();
    const remove = page.getByTestId('cut-out-controls__minIsland').nth(1);
    await expect(remove).toHaveAttribute('aria-pressed', 'true');
    await expect(keep).toHaveAttribute('aria-pressed', 'false');

    await keep.click();
    await expect(keep).toHaveAttribute('aria-pressed', 'true');

    // Waits out the 120 ms debounce, so the shot shows a settled picture and the working state is
    // asserted to actually end rather than merely to appear.
    await expect(page.getByTestId('cut-out-controls__state')).toHaveText(
      'Tap a choice to see it change.',
    );
    await page.screenshot({ path: `screenshots/ft-cut-out-tuning-${stamp()}.png` });

    await page.getByTestId('photo-cropper__use').click();
    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);
  });

  test('the fine-tune sliders reach the same numbers, and reset puts them back', async ({
    page,
  }) => {
    await openStudio(page, 'FineTuner');
    await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(0));
    await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.refined, {
      timeout: 30_000,
    });

    const toggle = page.getByTestId('cut-out-controls__fine-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('cut-out-controls__threshold-range')).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const slider = page.getByTestId('cut-out-controls__threshold-range');
    await expect(slider).toBeVisible();
    await expect(page.getByTestId('cut-out-controls__threshold-value')).toHaveText('128');

    await slider.fill('200');
    await expect(page.getByTestId('cut-out-controls__threshold-value')).toHaveText('200');
    // No coarse step sits at 200, so none of them claims to be pressed.
    await expect(page.getByTestId('cut-out-controls__threshold').nth(2)).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.screenshot({ path: `screenshots/ft-cut-out-fine-${stamp()}.png` });

    await page.getByTestId('cut-out-controls__reset').click();
    await expect(page.getByTestId('cut-out-controls__threshold-value')).toHaveText('128');
  });

  /*
   * ADR-077 — the escape hatch, driven the way a participant would. With the cut-out off the three
   * numbers govern nothing, so they must not be on screen offering to do something.
   */
  test('turns the cut-out off entirely, and puts the numbers away with it', async ({ page }) => {
    await openStudio(page, 'NoCutOut');
    await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(0));
    await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.refined, {
      timeout: 30_000,
    });

    const takeOut = page.getByTestId('cut-out-controls__background').first();
    const keepPhoto = page.getByTestId('cut-out-controls__background').nth(1);
    await expect(takeOut).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('cut-out-controls__threshold')).toHaveCount(3);

    await keepPhoto.click();

    await expect(keepPhoto).toHaveAttribute('aria-pressed', 'true');
    await expect(takeOut).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('cut-out-controls__threshold')).toHaveCount(0);
    await expect(page.getByTestId('cut-out-controls__minIsland')).toHaveCount(0);
    await expect(page.getByTestId('cut-out-controls__edge')).toHaveCount(0);
    await expect(page.getByTestId('cut-out-controls__preview')).toBeVisible();

    // ADR-078 — the two fixed actions stay put and go grey rather than vanishing with the rows.
    const fine = page.getByTestId('cut-out-controls__fine-toggle');
    const reset = page.getByTestId('cut-out-controls__reset');
    await expect(fine).toBeVisible();
    await expect(fine).toBeDisabled();
    await expect(fine).toHaveAttribute('aria-expanded', 'false');
    await expect(reset).toBeVisible();
    await expect(reset).toBeDisabled();

    // And it is a real choice, not a dead end: turning it back on restores the rows and the actions.
    await takeOut.click();
    await expect(page.getByTestId('cut-out-controls__threshold')).toHaveCount(3);
    await expect(fine).toBeEnabled();
    await expect(reset).toBeEnabled();

    await page.getByTestId('photo-cropper__use').click();
    expect((await savedSprite(page)).startsWith('128:')).toBe(true);
  });

  /*
   * ADR-079 — reported bug: "when I select 'Leave it in' the preview looks correct but when saved the
   * background removal still happened."
   *
   * The regression test for the whole feature, because it is the only one that asks what the *server*
   * ends up holding after the path a participant actually takes: turn the cut-out off, then press
   * Save. Every other test here reads the preview or goes through "Use this square", and both were
   * fine while the saved sprite was wrong.
   */
  test('saves the photo uncut when the cut-out is off, once "Use this square" is pressed (ADR-079, ADR-229)', async ({
    page,
  }) => {
    await openStudio(page, 'SaveUncut');
    await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(0));
    await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.refined, {
      timeout: 30_000,
    });

    await page.getByTestId('cut-out-controls__background').nth(1).click();
    await expect(page.getByTestId('cut-out-controls__reset')).toBeDisabled();
    // Let the trailing debounce land, so the draft holds the settled picture and not the previous one.
    await expect(page.getByTestId('cut-out-controls__state')).toHaveText(
      'Tap a choice to see it change.',
    );

    // ADR-229 — the photo reaches the draft only through "Use this square", and the open dialog covers Save until
    // then. So the path is the square, then Save; the choice must survive both.
    await useSquare(page);
    const sprite = parseAvatarSprite(await savedSprite(page));
    expect(sprite).not.toBeNull();
    const colours = Object.keys(sprite?.palette ?? {}).length;
    const painted = (sprite?.rows ?? []).join('');

    // With nothing cut out, neither the backdrop nor the ink index may appear in the saved rows.
    expect(painted).not.toContain((colours - 2).toString(16));
    expect(painted).not.toContain((colours - 1).toString(16));
  });

  test('hides the cut-out row when no model answered, and keeps the other two', async ({
    page,
  }) => {
    await page.unroute(CDN);
    await page.route(CDN, (route) => route.abort());

    await openStudio(page, 'NoModel');
    await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(0));
    await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.plain, {
      timeout: 30_000,
    });

    // Nothing was matted, so there is no alpha to threshold — but stray bits and the edge still mean
    // something on the colour cut-out, and they are still offered.
    await expect(page.getByTestId('cut-out-controls__threshold')).toHaveCount(0);
    await expect(page.getByTestId('cut-out-controls__minIsland')).toHaveCount(2);
    await expect(page.getByTestId('cut-out-controls__edge')).toHaveCount(3);
  });
});
