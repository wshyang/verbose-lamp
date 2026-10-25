import { expect, test } from '@playwright/test';
import { gotoFrozen } from './support/stage';

/**
 * Interaction flows (ADDENDUM-022 §4). These assert behaviour, not pixels, so
 * they stay green across cosmetic changes and catch broken wiring before the
 * likeness shots do.
 */
test.describe('premiere flows', () => {
  test('transport: replay, scrub and chapter selection move the frame', async ({ page }) => {
    await gotoFrozen(page, 12);
    await page.keyboard.press('h');

    await page.getByTestId('timeline__replay').click();
    await expect(page.getByTestId('timeline__chapter').first()).toHaveAttribute('aria-current', 'true');

    await page.getByTestId('timeline__chapter').nth(2).click();
    await expect(page.getByTestId('timeline__chapter').nth(2)).toHaveAttribute('aria-current', 'true');

    const scrubber = page.getByTestId('timeline__scrubber');
    await scrubber.fill('30');
    await expect(scrubber).toHaveValue('30');
  });

  test('frame studio opens, switches surface and closes', async ({ page }) => {
    await gotoFrozen(page, 12);
    await expect(page.getByTestId('frame-studio__panel')).toBeVisible();
    await page.getByTestId('frame-studio__surface-border').click();
    await expect(page.getByTestId('frame-studio__surface-border')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('frame-studio__surface-sequence').click();
    await page.getByTestId('frame-studio__pattern').filter({ hasText: 'Deco Lattice' }).click();
    await expect(page.getByTestId('frame-studio__reroll')).toBeVisible();
    await page.getByTestId('frame-studio__dismiss').click();
    await expect(page.getByTestId('frame-studio__panel')).toHaveCount(0);
    await expect(page.getByTestId('frame-studio__reveal')).toBeVisible();
  });

  test('spectacle console opens, plays a sparkler and closes', async ({ page }) => {
    await gotoFrozen(page, 12);
    await page.getByTestId('spectacle-preview__launch').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toBeVisible();
    await page.getByTestId('spectacle-preview__sparkler').first().click();
    await page.getByTestId('spectacle-preview__panel').getByRole('button', { name: /sparkler fan/i }).click();
    await page.getByTestId('spectacle-preview__close').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toHaveCount(0);
  });

  test('event night opens and returns to the premiere', async ({ page }) => {
    await gotoFrozen(page, 12);
    await page.getByTestId('event-night__launch').click();
    await expect(page.getByTestId('event-night__back')).toBeVisible();
    await page.getByTestId('event-night__back').click();
    await expect(page.getByTestId('cinematic-stage__canvas')).toBeVisible();
  });
});
