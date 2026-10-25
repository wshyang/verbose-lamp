import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('timeline__play-toggle')).toBeVisible();
});

test('play and pause toggle the transport label', async ({ page }) => {
  const toggle = page.getByTestId('timeline__play-toggle');
  await expect(toggle).toHaveAccessibleName(/pause/i);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/play/i);
});

test('chapter buttons and the scrubber move the clock', async ({ page }) => {
  await page.getByTestId('timeline__play-toggle').click(); // pause for a stable clock
  await page.getByTestId('timeline__chapter').nth(2).click();
  await expect(page.getByTestId('timeline__scrubber')).toHaveValue(/1[45]/);
  await page.getByTestId('timeline__scrubber').fill('30');
  await expect(page.getByTestId('timeline__scrubber')).toHaveValue('30');
  await page.getByTestId('timeline__replay').click();
  await expect(page.getByTestId('timeline__scrubber')).toHaveValue('0');
});

test('h hides the HUD', async ({ page }) => {
  await page.keyboard.press('h');
  await expect(page.getByTestId('timeline__play-toggle')).toBeHidden();
  await page.keyboard.press('h');
  await expect(page.getByTestId('timeline__play-toggle')).toBeVisible();
});

test('research dialog opens and Escape closes it', async ({ page }) => {
  await page.getByTestId('premiere-header__research').click();
  await expect(page.getByTestId('research-dialog__close')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('research-dialog__close')).toBeHidden();
});

test('applying a custom title jumps to Act V', async ({ page }) => {
  await page.getByTestId('premiere-header__customize').click();
  await page.getByTestId('title-customizer__main-title').fill('DAISY');
  await page.getByTestId('title-customizer__apply').click();
  await expect(page.getByTestId('timeline__chapter').nth(4)).toContainText('DAISY');
});

test('celebration overlay plays a sparkler transition over the premiere', async ({ page }) => {
  await page.getByTestId('celebration-overlay__launch').click();
  await expect(page.getByTestId('celebration-overlay__panel')).toBeVisible();
  await page.getByTestId('celebration-overlay__action').first().click();
  await expect(page.getByTestId('spectacle-layer__host').locator('canvas').first()).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('celebration-overlay__panel')).toBeHidden();
});
