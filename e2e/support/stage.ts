import type { Page } from '@playwright/test';

export interface FrozenOptions {
  /** Keep the HUD visible (default hides it with the `h` shortcut). */
  hud?: boolean;
  nitrate?: boolean;
  orbit?: boolean;
}

const FRAME_READY = '[data-testid="cinematic-stage__canvas"][data-frame-ready="true"]';

/**
 * Opens the premiere frozen at a sequence time (?freezeAt=, ADDENDUM-022
 * §0.2) and waits until the deterministic frame has actually rendered.
 */
export async function gotoFrozen(page: Page, seconds: number, opts: FrozenOptions = {}): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  await page.waitForSelector(FRAME_READY);
  if (opts.orbit) await page.getByTestId('premiere-header__orbit').click();
  if (opts.nitrate) await page.getByTestId('premiere-header__nitrate').click();
  if (!opts.hud) await page.keyboard.press('h');
  // Frozen time does not advance, but give mode changes a frame to paint.
  await page.waitForSelector(FRAME_READY);
}
