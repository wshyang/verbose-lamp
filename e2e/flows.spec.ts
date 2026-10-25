import { expect, test } from '@playwright/test';
import { CANVAS, clockReadout } from './support/stage';

/**
 * The interactions a guest actually performs (ADDENDUM-022 §0.5), against the live clock
 * rather than a frozen frame.
 */
test.describe('premiere flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`${CANVAS}[data-frame-ready="true"]`)).toBeAttached({ timeout: 20_000 });
  });

  test('play and pause toggles the transport label', async ({ page }) => {
    const toggle = page.getByTestId('timeline__play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Play sequence');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
  });

  test('each chapter button moves the clock into that act', async ({ page }) => {
    const chapters = page.getByTestId('timeline__chapter');
    const count = await chapters.count();
    expect(count).toBe(5);

    const numerals = ['I', 'II', 'III', 'IV', 'V'];
    for (let index = 0; index < count; index += 1) {
      await chapters.nth(index).click();
      await expect(page.locator('footer').getByText(numerals[index], { exact: true })).toBeVisible();
    }
  });

  test('the scrubber moves the clock', async ({ page }) => {
    await page.getByTestId('timeline__play-toggle').click();
    const scrubber = page.getByTestId('timeline__scrubber');
    const before = await clockReadout(page).textContent();

    await scrubber.focus();
    await page.keyboard.press('End');
    await expect(clockReadout(page)).not.toHaveText(before ?? '');

    await page.keyboard.press('Home');
    await expect(clockReadout(page)).toContainText('00:00');
  });

  test('h hides the HUD and brings it back', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toHaveCSS('opacity', '1');
    await page.keyboard.press('h');
    await expect(footer).toHaveCSS('opacity', '0');
    await page.keyboard.press('h');
    await expect(footer).toHaveCSS('opacity', '1');
  });

  test('the research dialog opens and closes', async ({ page }) => {
    await page.getByTestId('premiere-header__research').click();
    await expect(page.getByTestId('research-dialog__backdrop')).toBeVisible();
    await page.getByTestId('research-dialog__close').click();
    await expect(page.getByTestId('research-dialog__backdrop')).toHaveCount(0);
  });

  test('Escape closes the title customiser', async ({ page }) => {
    await page.getByTestId('premiere-header__customize').click();
    await expect(page.getByTestId('title-customizer__dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
  });

  test('Frame Studio opens, switches surface and dismisses', async ({ page }) => {
    await page.getByTestId('frame-studio__reveal').click();
    await expect(page.getByTestId('frame-studio__panel')).toBeVisible();
    await page.getByTestId('frame-studio__surface-border').click();
    await expect(page.getByTestId('frame-studio__border-row')).toBeVisible();
    await page.getByTestId('frame-studio__surface-sequence').click();
    await expect(page.getByTestId('frame-studio__pattern')).toBeVisible();
    await page.getByTestId('frame-studio__dismiss').click();
    await expect(page.getByTestId('frame-studio__reveal')).toBeVisible();
  });

  test('applying a custom title jumps to the finale', async ({ page }) => {
    await page.getByTestId('premiere-header__customize').click();
    const mainTitle = page.getByTestId('title-customizer__main-title');
    await mainTitle.fill('THE LAST GATSBY');
    await page.getByTestId('title-customizer__apply').click();

    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
    const chapters = page.getByTestId('timeline__chapter');
    await expect(chapters.nth(4)).toContainText('THE LAST GATSBY');
    await expect(page.locator('footer')).toContainText('ACT V');
  });
});
