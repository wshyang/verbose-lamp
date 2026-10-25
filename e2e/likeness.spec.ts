import { expect, test } from '@playwright/test';
import { gotoFrame } from './support/stage';

/**
 * The likeness gate (ADDENDUM-022 §4). Every frame below is a frozen moment of
 * the five-act sequence; the whole page is captured with the HUD hidden.
 * Baselines must be captured once by the user in a real browser and then never
 * re-recorded without an addendum explaining the intended visual change.
 */
const SHOTS = [
  { name: 'act1-nitrate-opening', at: 1.0 },
  { name: 'act1-monogram-hold', at: 4.32 },
  { name: 'act1-fly-through', at: 6.7 },
  { name: 'act2-hold', at: 9.5 },
  { name: 'act3-hold', at: 16.2 },
  { name: 'act4-hold', at: 23.0 },
  { name: 'act5-hero-hold', at: 30.5 },
  { name: 'act5-finale', at: 37.2 },
] as const;

test.describe('premiere likeness', () => {
  for (const shot of SHOTS) {
    test(shot.name, async ({ page }) => {
      await gotoFrame(page, shot.at);
      await expect(page).toHaveScreenshot(`${shot.name}.png`, { fullPage: false });
    });
  }
});

test.describe('premiere likeness, nitrate forced', () => {
  test('act5-hero-nitrate', async ({ page }) => {
    await gotoFrame(page, 30.5);
    await page.getByTestId('premiere-header__nitrate').click();
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('act5-hero-nitrate.png');
  });
});
