import { expect, type Page } from '@playwright/test';

export interface FrozenStageOptions {
  /** Show the HUD (off by default so the canvas is photographed alone). */
  hud?: boolean;
  /** Force the silver-nitrate look. */
  nitrate?: boolean;
  /** Switch to the interactive orbit camera. */
  orbit?: boolean;
  /** Enable the camera-parented screen border from the Frame Studio. */
  screenBorder?: boolean;
}

const HUD_READY = '[data-testid="cinematic-stage__canvas"]';

/**
 * Loads the sequence frozen on one frame and waits for a stable picture
 * (ADDENDUM-022 §0.5). Everything the likeness shots do goes through here.
 */
export async function gotoFrozen(
  page: Page,
  seconds: number,
  options: FrozenStageOptions = {}
): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  const stage = page.locator(HUD_READY);
  await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: 30_000 });
  if (options.orbit) await page.getByTestId('premiere-header__orbit').click();
  if (options.nitrate) await page.getByTestId('premiere-header__nitrate').click();
  if (options.screenBorder) await enableScreenBorder(page);
  if (options.hud !== true) await page.keyboard.press('h');
  // Two frames for the click to reach the renderer, then let it settle.
  await page.waitForTimeout(250);
}

async function enableScreenBorder(page: Page): Promise<void> {
  const reveal = page.getByTestId('frame-studio__reveal');
  if (await reveal.isVisible()) await reveal.click();
  await page.getByTestId('frame-studio__surface-border').click();
  await page.getByTestId('frame-studio__border-enable').click();
}

/** Hides the HUD for a clean full-page screenshot. */
export async function hideHud(page: Page): Promise<void> {
  await page.keyboard.press('h');
  await page.waitForTimeout(150);
}
