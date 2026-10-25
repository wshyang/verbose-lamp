import { expect, test } from '@playwright/test';

/**
 * Interaction flows (ADDENDUM-022 §0.5). These do not compare pixels; they prove
 * the HUD reaches the renderer and that the modal, console and screen-switch
 * wiring survives a refactor.
 */
test.describe('premiere flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('cinematic-stage__canvas')).toBeVisible();
  });

  test('play/pause toggle reflects the label', async ({ page }) => {
    const toggle = page.getByTestId('timeline__play-toggle');
    const before = await toggle.innerText();
    await toggle.click();
    await expect(toggle).not.toHaveText(before);
  });

  test('every chapter button moves the clock into its act', async ({ page }) => {
    const chapters = page.getByTestId('timeline__chapter');
    const count = await chapters.count();
    expect(count).toBe(5);
    for (let i = 0; i < count; i += 1) {
      await chapters.nth(i).click();
      await expect(chapters.nth(i)).toHaveAttribute('aria-current', 'true');
    }
  });

  test('scrubbing changes the time readout', async ({ page }) => {
    const scrubber = page.getByTestId('timeline__scrubber');
    const readout = page.getByTestId('timeline__clock');
    const before = await readout.innerText();
    await scrubber.fill('30');
    await expect(readout).not.toHaveText(before);
  });

  test('h hides the HUD and shows it again', async ({ page }) => {
    const header = page.getByTestId('premiere-header__research');
    await expect(header).toBeVisible();
    await page.keyboard.press('h');
    await expect(header).toBeHidden();
    await page.keyboard.press('h');
    await expect(header).toBeVisible();
  });

  test('each dialog opens from its testid and Escape closes it', async ({ page }) => {
    const dialogs = [
      { open: 'premiere-header__research', close: 'research-dialog__close' },
      { open: 'premiere-header__customize', close: 'title-customizer__apply' },
      { open: 'qr-generator__launch', close: 'qr-generator__close' },
      { open: 'avatar-studio__launch', close: 'avatar-studio__close' },
    ];
    for (const dialog of dialogs) {
      await page.getByTestId(dialog.open).click();
      await expect(page.getByTestId(dialog.close)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId(dialog.close)).toBeHidden();
    }
  });

  test('the spectacle console opens from the premiere header', async ({ page }) => {
    await page.getByTestId('spectacle-preview__launch').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toBeVisible();
    await page.getByTestId('spectacle-preview__fireworks').click();
    await page.getByTestId('spectacle-preview__close').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toBeHidden();
  });

  test('the sparkler button lights sparklers and announces them', async ({ page }) => {
    await page.getByTestId('party-sparklers__launch').click();
    await expect(page.getByTestId('party-sparklers__overlay')).toBeVisible();
    await page.getByTestId('party-sparklers__light').click();
    await expect(page.getByTestId('spectacle-layer__announcement')).toHaveText('Sparklers lit');
  });

  test('Dinner & Dance switches screens and Back returns', async ({ page }) => {
    await page.getByTestId('event-night__launch').click();
    await expect(page.getByTestId('event-night__screen')).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId('cinematic-stage__canvas')).toBeVisible();
  });
});
