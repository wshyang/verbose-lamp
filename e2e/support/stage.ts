import { expect, type Page } from '@playwright/test';

/** Freeze options shared by the likeness and flow specs. */
export interface FrozenOptions {
  /** `false` hides the HUD so the screenshot is of the film alone. */
  hud?: boolean;
  nitrate?: boolean;
  orbit?: boolean;
}

const READY_TIMEOUT_MS = 20_000;
const SETTLE_MS = 600;

/**
 * Opens the premiere pinned to one frame and waits for three composited
 * frames. `?freezeAt=` stops playback and pointer aim (ADDENDUM-027 §3), so
 * the capture is reproducible.
 */
export async function gotoFrozen(page: Page, seconds: number, options: FrozenOptions = {}): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  const stage = page.getByTestId('cinematic-stage__canvas');
  await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: READY_TIMEOUT_MS });
  if (options.hud === false) await page.keyboard.press('h');
  if (options.nitrate) await page.getByTestId('premiere-header__nitrate').click();
  if (options.orbit) await page.getByTestId('premiere-header__orbit').click();
  await page.waitForTimeout(SETTLE_MS);
}

/** Frozen premiere with the HUD hidden: the likeness baseline shot. */
export async function gotoFrame(page: Page, seconds: number): Promise<void> {
  await gotoFrozen(page, seconds, { hud: false });
}
