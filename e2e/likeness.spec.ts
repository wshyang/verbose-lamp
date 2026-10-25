import { expect, test } from '@playwright/test';
import { gotoFrozen, type FrozenOptions } from './support/stage';

interface Shot {
  name: string;
  at: number;
  options?: FrozenOptions;
}

const SHOTS: readonly Shot[] = [
  { name: 'act1-nitrate-opening', at: 1.0 },
  { name: 'act1-monogram-hold', at: 4.32 },
  { name: 'act1-fly-through', at: 6.7 },
  { name: 'act2-hold', at: 11.28 },
  { name: 'act3-hold', at: 18.08 },
  { name: 'act4-hold', at: 24.82 },
  { name: 'act5-hero-hold', at: 33.8 },
  { name: 'act5-finale-bookend', at: 37.0 },
  { name: 'act5-nitrate-forced', at: 33.8, options: { nitrate: true } },
  { name: 'act5-orbit', at: 33.8, options: { orbit: true } },
  { name: 'hud-overlay', at: 11.28, options: { hud: true } },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    await gotoFrozen(page, shot.at, shot.options);
    // SwiftShader needs two slow software captures to confirm stability.
    await expect(page).toHaveScreenshot(`${shot.name}.png`, { fullPage: true, timeout: 120_000 });
  });
}

test('act5-screen-border', async ({ page }) => {
  await page.goto('/?freezeAt=33.8');
  await page.waitForSelector('[data-testid="cinematic-stage__canvas"][data-frame-ready="true"]');
  // On small screens the studio starts tucked away (ADDENDUM-030); open it.
  const reveal = page.getByTestId('frame-studio__reveal');
  if (await reveal.count()) await reveal.click();
  await page.getByTestId('frame-studio__surface-border').click();
  await page.getByTestId('frame-studio__border-enable').check();
  await page.keyboard.press('h');
  await expect(page).toHaveScreenshot('act5-screen-border.png', { fullPage: true, timeout: 120_000 });
});
