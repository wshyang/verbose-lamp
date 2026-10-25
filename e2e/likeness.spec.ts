import { expect as baseExpect, test } from '@playwright/test';
import { gotoFrozen } from './support/stage';

/**
 * A software-rendered frame takes ~30 s to photograph here, and `toHaveScreenshot`
 * needs two consecutive identical captures before it will accept a frame. The
 * default 5 s expect budget cannot reach that; this one can (ADDENDUM-043).
 */
const expect = baseExpect.configure({ timeout: 120_000 });

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

  // The Event Night stage has no still frame: it is a live, ambient show with no
  // `?freezeAt` equivalent, and two consecutive captures differ by 3–26 % of their
  // pixels, so Playwright cannot even reach a stable expectation (ADDENDUM-043).
  // Photographing it here would mean photographing a random moment. `flows.spec.ts`
  // asserts it mounts and animates instead, which is what can be held honestly.
});
