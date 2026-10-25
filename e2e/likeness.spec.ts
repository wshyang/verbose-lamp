import { expect, test, type Page } from '@playwright/test';
import { dismissFrameStudio, enableLatticeBrass, enableScreenBorder, gotoFrozen, hideHud } from './support/stage';

/**
 * A capture on SwiftShader takes tens of seconds and `toHaveScreenshot` takes its timeout per
 * call, not from the config, so the budget is stated here.
 */
const CAPTURE_TIMEOUT_MS = 120_000;

function shoot(page: Page, name: string) {
  return expect(page).toHaveScreenshot(`${name}.png`, { timeout: CAPTURE_TIMEOUT_MS });
}

/**
 * The likeness gate. Every shot pins one moment of the 38-second sequence: `?freezeAt=` holds the
 * clock and the pointer aim, so camera, cards, dust and nitrate are identical between runs, and
 * the shot name is the snapshot key, so a diff reads `act2-hold` rather than a frame number.
 *
 * Baselines are OS-suffixed and only comparable on the OS, browser build and rasteriser that
 * recorded them. They are recorded on SwiftShader, so they prove repeatability, not how the
 * scene looks on a GPU. `npm run e2e:update` re-records; that is a reviewed act, never a reflex
 * after a red run.
 */
const MOMENTS = [
  { name: 'act1-nitrate-opening', at: 1.0 },
  { name: 'act1-monogram-hold', at: 4.32 },
  { name: 'act1-fly-through', at: 6.7 },
  { name: 'act2-hold', at: 11.28 },
  { name: 'act3-hold', at: 18.08 },
  { name: 'act4-hold', at: 24.82 },
  { name: 'act5-hero-hold', at: 33.8 },
  { name: 'act5-finale-bookend', at: 37.0 },
] as const;

test.describe('premiere likeness: the five acts', () => {
  for (const moment of MOMENTS) {
    test(moment.name, async ({ page }) => {
      await gotoFrozen(page, moment.at);
      await shoot(page, moment.name);
    });
  }
});

test.describe('premiere likeness: camera, filter and frame variants', () => {
  test('act5-nitrate-forced', async ({ page }) => {
    await gotoFrozen(page, 33.8, { nitrate: true });
    await shoot(page, 'act5-nitrate-forced');
  });

  test('act5-orbit', async ({ page }) => {
    await gotoFrozen(page, 33.8, { orbit: true });
    await shoot(page, 'act5-orbit');
  });

  test('act5-screen-border', async ({ page }) => {
    await gotoFrozen(page, 33.8, { hud: true });
    await enableScreenBorder(page);
    await dismissFrameStudio(page);
    await hideHud(page);
    await shoot(page, 'act5-screen-border');
  });

  // The brass finish (ADDENDUM-031): a lattice title card inside a lattice proscenium.
  test('act5-lattice-brass', async ({ page }) => {
    await gotoFrozen(page, 33.8, { hud: true });
    await enableLatticeBrass(page);
    await dismissFrameStudio(page);
    await hideHud(page);
    await shoot(page, 'act5-lattice-brass');
  });

  // The one shot where the DOM is the subject. The studio is dismissed first: its lattice preview
  // runs on a JS timer, so it never holds still long enough to be a stable baseline.
  test('hud-overlay', async ({ page }) => {
    await gotoFrozen(page, 11.28, { hud: true });
    await dismissFrameStudio(page);
    await shoot(page, 'hud-overlay');
  });
});
