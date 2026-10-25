import { expect, test, type Page } from '@playwright/test';
import { gotoFrozen, showScreenBorder } from './support/stage';

/**
 * A full-page capture of the SwiftShader canvas takes 40-70 s, well past the config's
 * assertion budget, and `toHaveScreenshot` takes its timeout per call, not from the config.
 */
const CAPTURE_TIMEOUT_MS = 120_000;

function shot(page: Page, name: string) {
  return expect(page).toHaveScreenshot(name, { fullPage: true, timeout: CAPTURE_TIMEOUT_MS });
}

/**
 * Visual likeness gate for the premiere (ADDENDUM-022 §0.5).
 *
 * Every shot pins one moment of the 38-second sequence. `?freezeAt=` holds the clock, so
 * the camera, cards, dust and nitrate are identical between runs; the shot names are the
 * snapshot keys, so a diff reads as `act2-hold` rather than a numbered frame.
 */
test.describe('premiere likeness', () => {
  test('act1 nitrate opening', async ({ page }) => {
    await gotoFrozen(page, 1.0);
    await shot(page, 'act1-nitrate-opening.png');
  });

  test('act1 monogram hold', async ({ page }) => {
    await gotoFrozen(page, 4.32);
    await shot(page, 'act1-monogram-hold.png');
  });

  test('act1 fly-through', async ({ page }) => {
    await gotoFrozen(page, 6.7);
    await shot(page, 'act1-fly-through.png');
  });

  test('act2 hold', async ({ page }) => {
    await gotoFrozen(page, 11.28);
    await shot(page, 'act2-hold.png');
  });

  test('act3 hold', async ({ page }) => {
    await gotoFrozen(page, 18.08);
    await shot(page, 'act3-hold.png');
  });

  test('act4 hold', async ({ page }) => {
    await gotoFrozen(page, 24.82);
    await shot(page, 'act4-hold.png');
  });

  test('act5 hero hold', async ({ page }) => {
    await gotoFrozen(page, 33.8);
    await shot(page, 'act5-hero-hold.png');
  });

  test('act5 finale bookend', async ({ page }) => {
    await gotoFrozen(page, 37.0);
    await shot(page, 'act5-finale-bookend.png');
  });

  test('act5 forced nitrate', async ({ page }) => {
    await gotoFrozen(page, 33.8, { nitrate: true });
    await shot(page, 'act5-nitrate-forced.png');
  });

  test('act5 orbit camera', async ({ page }) => {
    await gotoFrozen(page, 33.8, { orbit: true });
    await shot(page, 'act5-orbit.png');
  });

  test('act5 screen border', async ({ page }) => {
    await gotoFrozen(page, 33.8, { hud: true });
    await showScreenBorder(page);
    await page.keyboard.press('h');
    await expect(page.locator('footer')).toHaveCSS('opacity', '0');
    await shot(page, 'act5-screen-border.png');
  });

  test('hud overlay', async ({ page }) => {
    await gotoFrozen(page, 11.28, { hud: true });
    await shot(page, 'hud-overlay.png');
  });
});
