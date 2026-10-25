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
    await dismissFrameStudio(page);
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

/** The studio docks open on first visit; this leaves it open and focused on the panel. */
export async function openFrameStudio(page: Page): Promise<void> {
  if ((await page.getByTestId('frame-studio__panel').count()) === 0) {
    await page.getByTestId('frame-studio__reveal').click();
  }
  await expect(page.getByTestId('frame-studio__panel')).toBeVisible();
}

export async function dismissFrameStudio(page: Page): Promise<void> {
  const dismiss = page.getByTestId('frame-studio__dismiss');
  if (await dismiss.count()) {
    await dismiss.click();
    await expect(page.getByTestId('frame-studio__panel')).toHaveCount(0);
  }
}

/** Opens Frame Studio, enables the screen border, then dismisses the panel again. */
export async function showScreenBorder(page: Page): Promise<void> {
  await openFrameStudio(page);
  await page.getByTestId('frame-studio__surface-border').click();
  const enable = page.getByTestId('frame-studio__border-enable');
  if (!(await enable.isChecked())) await enable.check();
  await expect(enable).toBeChecked();
  await dismissFrameStudio(page);
}

/** The `00:11 / 00:38` readout in the timeline. */
export function clockReadout(page: Page) {
  return page.locator('footer').getByText(/^\d\d:\d\d\s+\/\s+\d\d:\d\d$/);
}
