import { expect, type Page } from '@playwright/test';

export interface FrozenStageOptions {
  hud?: boolean;
  nitrate?: boolean;
  orbit?: boolean;
}

/** Opens one deterministic likeness frame and applies the requested toggles. */
export async function gotoFrozen(page: Page, seconds: number, opts: FrozenStageOptions = {}): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  await expect(page.getByTestId('cinematic-stage__canvas')).toHaveAttribute('data-frame-ready', 'true');
  if (opts.nitrate) await page.getByTestId('premiere-header__nitrate').click();
  if (opts.orbit) await page.keyboard.press('o');
  if (!opts.hud) await page.keyboard.press('h');
  await page.waitForTimeout(100);
}
