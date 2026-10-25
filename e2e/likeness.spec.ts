import { expect, test } from '@playwright/test';
import { gotoFrozen } from './support/stage';

const SHOTS = [
  { name: 'act1-nitrate-opening', seconds: 1.0 },
  { name: 'act1-monogram-hold', seconds: 4.32 },
  { name: 'act1-fly-through', seconds: 6.7 },
  { name: 'act2-hold', seconds: 11.28 },
  { name: 'act3-hold', seconds: 18.08 },
  { name: 'act4-hold', seconds: 24.82 },
  { name: 'act5-hero-hold', seconds: 33.8 },
  { name: 'act5-finale-bookend', seconds: 37.0 },
] as const;

// Software-WebGL (SwiftShader) screenshot capture at desktop size can take
// well over the default assertion timeout on cold CI runners.
const SHOT_OPTIONS = { fullPage: true, timeout: 90_000 } as const;

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    test.slow();
    await gotoFrozen(page, shot.seconds);
    await expect(page).toHaveScreenshot(SHOT_OPTIONS);
  });
}

test('act5-nitrate-forced', async ({ page }) => {
  test.slow();
  await gotoFrozen(page, 33.8, { nitrate: true });
  await expect(page).toHaveScreenshot(SHOT_OPTIONS);
});

test('act5-orbit', async ({ page }) => {
  test.slow();
  await gotoFrozen(page, 33.8, { orbit: true });
  await expect(page).toHaveScreenshot(SHOT_OPTIONS);
});

test('act5-screen-border', async ({ page }) => {
  test.slow();
  await gotoFrozen(page, 33.8, { hud: true });
  await page.getByTestId('frame-studio__surface-border').click();
  await page.getByTestId('frame-studio__border-enable').check();
  await page.keyboard.press('h');
  await expect(page).toHaveScreenshot(SHOT_OPTIONS);
});

test('hud-overlay', async ({ page }) => {
  test.slow();
  await gotoFrozen(page, 11.28, { hud: true });
  await expect(page).toHaveScreenshot(SHOT_OPTIONS);
});
