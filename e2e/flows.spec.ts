import { expect, test, type Page } from '@playwright/test';

async function gotoLive(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('cinematic-stage__canvas')).toHaveAttribute('data-frame-ready', 'true');
}

test('play toggle changes its label', async ({ page }) => {
  await gotoLive(page);
  const toggle = page.getByTestId('timeline__play-toggle');
  await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Play sequence');
});

test('chapter buttons move the sequence into each act', async ({ page }) => {
  await gotoLive(page);
  const chapters = page.getByTestId('timeline__chapter');
  await expect(chapters).toHaveCount(5);
  // The Frame Studio dock opens over the right-hand chapter buttons.
  await page.getByTestId('frame-studio__dismiss').click();
  await expect(page.getByTestId('frame-studio__panel')).toHaveCount(0);
  for (const [index, act] of ['ACT I', 'ACT II', 'ACT III', 'ACT IV', 'ACT V'].entries()) {
    await chapters.nth(index).click();
    await expect(page.getByText(act, { exact: true })).toBeVisible();
  }
});

test('scrubber changes the time readout', async ({ page }) => {
  await gotoLive(page);
  await page.getByTestId('timeline__play-toggle').click();
  const scrubber = page.getByTestId('timeline__scrubber');
  await scrubber.fill('20');
  await expect(scrubber).toHaveValue('20');
  await expect(page.getByText(/0:20/)).toBeVisible();
});

test('h hides and restores the HUD', async ({ page }) => {
  await gotoLive(page);
  await page.keyboard.press('h');
  await expect(page.getByLabel('Show cinema controls')).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.getByLabel('Hide cinema controls')).toBeVisible();
});

test('research modal opens and Escape closes it', async ({ page }) => {
  await gotoLive(page);
  await page.getByTestId('premiere-header__research').click();
  await expect(page.getByTestId('research-dialog__backdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('research-dialog__backdrop')).toHaveCount(0);
});

test('customizer opens and closes through its testid', async ({ page }) => {
  await gotoLive(page);
  await page.getByTestId('premiere-header__customize').click();
  await expect(page.getByTestId('title-customizer__dialog')).toBeVisible();
  await page.getByTestId('title-customizer__close').click();
  await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
});

test('applying a custom title jumps to act V', async ({ page }) => {
  await gotoLive(page);
  await page.getByTestId('premiere-header__customize').click();
  await page.getByTestId('title-customizer__main-title').fill('PREMIERE');
  await page.getByTestId('title-customizer__apply').click();
  await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
  await expect(page.getByText('ACT V', { exact: true })).toBeVisible();
});

test('spectacle origin picking only responds to the stage', async ({ page }) => {
  await gotoLive(page);
  await page.getByTestId('frame-studio__dismiss').click();
  await page.getByTestId('spectacle-preview__launch').click();
  await page.getByTestId('spectacle-preview__pick-origin').click();
  await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();
  await page.getByTestId('spectacle-preview__panel').click({ position: { x: 24, y: 18 } });
  await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();
  await page.getByTestId('spectacle-preview__close').click();
  await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Expected a viewport for the stage click');
  await page.mouse.click(viewport.width / 2, viewport.height * 0.52);
  await expect(page.getByTestId('spectacle-preview__pick-hint')).toHaveCount(0);
});
