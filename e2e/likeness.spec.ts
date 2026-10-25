import { expect, test } from '@playwright/test';
import { gotoFrozen, hideHud } from './support/stage';

/**
 * The visual contract (ADDENDUM-022 §0.4). Every shot is frozen mid-hold so the
 * frame is deterministic; the names are the snapshot keys, so they must be stable.
 * Re-baselining any of these is a visual change and needs an addendum.
 */
const SHOTS = [
  { name: 'act1-nitrate-opening', freezeAt: 1.0 },
  { name: 'act1-monogram-hold', freezeAt: 4.32 },
  { name: 'act1-fly-through', freezeAt: 6.7 },
  { name: 'act2-hold', freezeAt: 11.28 },
  { name: 'act3-hold', freezeAt: 18.08 },
  { name: 'act4-hold', freezeAt: 24.82 },
  { name: 'act5-hero-hold', freezeAt: 33.8 },
  { name: 'act5-finale-bookend', freezeAt: 37.0 },
] as const;

test.describe('likeness', () => {
  for (const shot of SHOTS) {
    test(`${shot.name} @${shot.freezeAt}s`, async ({ page }) => {
      await gotoFrozen(page, shot.freezeAt);
      await expect(page).toHaveScreenshot(`${shot.name}.png`, { fullPage: false });
    });
  }

  test('act5-nitrate-forced @33.8s', async ({ page }) => {
    await gotoFrozen(page, 33.8, { nitrate: true });
    await expect(page).toHaveScreenshot('act5-nitrate-forced.png');
  });

  test('act5-orbit @33.8s', async ({ page }) => {
    await gotoFrozen(page, 33.8, { orbit: true });
    await expect(page).toHaveScreenshot('act5-orbit.png');
  });

  test('act5-screen-border @33.8s', async ({ page }) => {
    await gotoFrozen(page, 33.8, { screenBorder: true });
    await expect(page).toHaveScreenshot('act5-screen-border.png');
  });

  test('hud-overlay @11.28s', async ({ page }) => {
    await gotoFrozen(page, 11.28, { hud: true });
    await expect(page).toHaveScreenshot('hud-overlay.png');
  });

  test('event-night ambient stage', async ({ page }) => {
    await page.goto('/#event-night');
    await expect(page.getByTestId('event-night__screen')).toBeVisible();
    await hideHud(page);
    await expect(page).toHaveScreenshot('event-night.png');
  });
});
