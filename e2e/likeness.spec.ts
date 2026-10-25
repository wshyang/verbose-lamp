import { expect, test } from '@playwright/test';
import { dismissFrameStudio, gotoFrame, gotoFrozen } from './support/stage';

/**
 * The likeness gate (ADDENDUM-022 §4, captured by ADDENDUM-029). Every frame
 * below is a frozen moment of the five-act sequence; the whole page is captured
 * with the HUD hidden unless the shot is about the HUD itself.
 *
 * These baselines were recorded on Linux + SwiftShader. Playwright suffixes
 * snapshots per platform, so a macOS run records `-darwin` files alongside
 * rather than fighting Linux pixels.
 */
const SHOTS = [
  { name: 'act1-nitrate-opening', at: 1.0 },
  { name: 'act1-monogram-hold', at: 4.32 },
  { name: 'act1-fly-through', at: 6.7 },
  { name: 'act2-hold', at: 11.28 },
  { name: 'act3-hold', at: 18.08 },
  { name: 'act4-hold', at: 24.82 },
  { name: 'act5-hero-hold', at: 33.8 },
  { name: 'act5-finale-bookend', at: 37.0 },
] as const;

test.describe('premiere likeness', () => {
  for (const shot of SHOTS) {
    test(shot.name, async ({ page }) => {
      await gotoFrame(page, shot.at);
      await expect(page).toHaveScreenshot(`${shot.name}.png`, { fullPage: false });
    });
  }
});

test.describe('premiere likeness, camera and filter variants', () => {
  test('act5-nitrate-forced', async ({ page }) => {
    // The toggle lives in the HUD, so it must be switched before the HUD hides.
    await gotoFrozen(page, 33.8, { nitrate: true, hud: false });
    await expect(page).toHaveScreenshot('act5-nitrate-forced.png');
  });

  test('act5-orbit', async ({ page }) => {
    await gotoFrozen(page, 33.8, { orbit: true, hud: false });
    await expect(page).toHaveScreenshot('act5-orbit.png');
  });

  test('act5-screen-border', async ({ page }) => {
    await gotoFrozen(page, 33.8, { hud: false });
    // The border is a Frame Studio surface: switch it, then hide the studio and
    // capture the camera-parented proscenium alone.
    await page.getByTestId('frame-studio__surface-border').click({ force: true, timeout: 60_000 });
    await expect(page.getByTestId('frame-studio__panel')).toBeVisible();
    await page.keyboard.press('h');
    await page.waitForTimeout(900);
    await expect(page).toHaveScreenshot('act5-screen-border.png');
  });

  test('hud-overlay', async ({ page }) => {
    // The one shot where the DOM is the subject: header and transport over the
    // canvas. The Frame Studio is dismissed first — its lattice preview runs on a
    // JS timer, so it never holds still long enough to be a stable baseline.
    await gotoFrozen(page, 11.28);
    await dismissFrameStudio(page);
    await expect(page).toHaveScreenshot('hud-overlay.png');
  });
});
