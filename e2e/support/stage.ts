import { expect, type Page } from '@playwright/test';

/** The WebGL mount div; it carries `data-frame-ready` once the frozen frame is on screen. */
export const CANVAS = '[data-testid="cinematic-stage__canvas"]';

export interface FrozenStageOptions {
  /** Leave the header/timeline/HUD visible. Defaults to hidden so shots show the sequence alone. */
  hud?: boolean;
  /** Force the silver-nitrate filter on (header toggle — there is no keyboard shortcut). */
  nitrate?: boolean;
  /** Switch to the interactive orbit camera (`o`). */
  orbit?: boolean;
}

/**
 * Loads the premiere frozen at `seconds` and waits for the scene to settle
 * (ADDENDUM-022 §0.5). Toggles that change the camera or the filter happen before the
 * HUD is hidden, because hiding the HUD also hides the header buttons.
 */
export async function gotoFrozen(
  page: Page,
  seconds: number,
  options: FrozenStageOptions = {},
): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  await expect(page.locator(`${CANVAS}[data-frame-ready="true"]`)).toBeAttached();

  if (options.orbit) {
    await page.keyboard.press('o');
    await expect(page.getByTestId('premiere-header__orbit')).toHaveAttribute('aria-pressed', 'true');
  }

  if (options.nitrate) {
    await page.getByTestId('premiere-header__nitrate').click();
    await expect(page.getByTestId('premiere-header__nitrate')).toHaveAttribute('aria-pressed', 'true');
  }

  if (!options.hud) {
    await page.keyboard.press('h');
    await expect(page.locator('footer')).toHaveCSS('opacity', '0');
  }

  // One more paint after the frame flag, so the composer's last pass is on screen.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Opens Frame Studio and switches it to the screen-border surface. */
export async function showScreenBorder(page: Page): Promise<void> {
  await page.getByTestId('frame-studio__reveal').click();
  await page.getByTestId('frame-studio__surface-border').click();
  const enable = page.getByTestId('frame-studio__border-enable');
  if (!(await enable.isChecked())) await enable.check();
  await expect(enable).toBeChecked();
}

/** The timeline's clock readout, e.g. `00:11 / 00:38`. */
export function clockReadout(page: Page) {
  return page.locator('footer').getByText(/^\d\d:\d\d\s+\/\s+\d\d:\d\d$/);
}
