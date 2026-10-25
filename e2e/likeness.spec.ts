import { expect, test } from '@playwright/test';
import { gotoFrozen, showScreenBorder } from './support/stage';

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
    await expect(page).toHaveScreenshot('act1-nitrate-opening.png', { fullPage: true });
  });

  test('act1 monogram hold', async ({ page }) => {
    await gotoFrozen(page, 4.32);
    await expect(page).toHaveScreenshot('act1-monogram-hold.png', { fullPage: true });
  });

  test('act1 fly-through', async ({ page }) => {
    await gotoFrozen(page, 6.7);
    await expect(page).toHaveScreenshot('act1-fly-through.png', { fullPage: true });
  });

  test('act2 hold', async ({ page }) => {
    await gotoFrozen(page, 11.28);
    await expect(page).toHaveScreenshot('act2-hold.png', { fullPage: true });
  });

  test('act3 hold', async ({ page }) => {
    await gotoFrozen(page, 18.08);
    await expect(page).toHaveScreenshot('act3-hold.png', { fullPage: true });
  });

  test('act4 hold', async ({ page }) => {
    await gotoFrozen(page, 24.82);
    await expect(page).toHaveScreenshot('act4-hold.png', { fullPage: true });
  });

  test('act5 hero hold', async ({ page }) => {
    await gotoFrozen(page, 33.8);
    await expect(page).toHaveScreenshot('act5-hero-hold.png', { fullPage: true });
  });

  test('act5 finale bookend', async ({ page }) => {
    await gotoFrozen(page, 37.0);
    await expect(page).toHaveScreenshot('act5-finale-bookend.png', { fullPage: true });
  });

  test('act5 forced nitrate', async ({ page }) => {
    await gotoFrozen(page, 33.8, { nitrate: true });
    await expect(page).toHaveScreenshot('act5-nitrate-forced.png', { fullPage: true });
  });

  test('act5 orbit camera', async ({ page }) => {
    await gotoFrozen(page, 33.8, { orbit: true });
    await expect(page).toHaveScreenshot('act5-orbit.png', { fullPage: true });
  });

  test('act5 screen border', async ({ page }) => {
    await gotoFrozen(page, 33.8, { hud: true });
    await showScreenBorder(page);
    await page.keyboard.press('h');
    await expect(page.locator('footer')).toHaveCSS('opacity', '0');
    await expect(page).toHaveScreenshot('act5-screen-border.png', { fullPage: true });
  });

  test('hud overlay', async ({ page }) => {
    await gotoFrozen(page, 11.28, { hud: true });
    await expect(page).toHaveScreenshot('hud-overlay.png', { fullPage: true });
  });
});
