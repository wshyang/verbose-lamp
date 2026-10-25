import { expect, test } from '@playwright/test';
import { CANVAS, clockReadout, dismissFrameStudio, openFrameStudio } from './support/stage';

/** `00:11 / 00:38` → 11. */
function readoutSeconds(text: string | null): number {
  const [minutes, seconds] = (text ?? '').slice(0, 5).split(':');
  return Number(minutes) * 60 + Number(seconds);
}

/** Act start times, in sequence seconds, and the numeral the timeline shows for each. */
const ACTS = [
  { numeral: 'I', start: 0 },
  { numeral: 'II', start: 7.2 },
  { numeral: 'III', start: 14 },
  { numeral: 'IV', start: 20.8 },
  { numeral: 'V', start: 27.5 },
];

/**
 * The interactions a guest actually performs (ADDENDUM-022 §0.5), against the live clock
 * rather than a frozen frame.
 */
test.describe('premiere flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`${CANVAS}[data-frame-ready="true"]`)).toBeAttached({ timeout: 60_000 });
  });

  test('the sequence is already running and the transport pauses it', async ({ page }) => {
    const toggle = page.getByTestId('timeline__play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');

    // The clock is the scene's, not a CSS animation: it has to reach the readout.
    await expect
      .poll(async () => readoutSeconds(await clockReadout(page).textContent()), { timeout: 30_000 })
      .toBeGreaterThan(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Play sequence');
    const paused = await clockReadout(page).textContent();
    await page.waitForTimeout(2_000);
    await expect(clockReadout(page)).toHaveText(paused ?? '');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
  });

  test('each chapter button moves the clock into that act', async ({ page }) => {
    // The frame studio docks open on the right and covers the last chapter button.
    await dismissFrameStudio(page);
    const chapters = page.getByTestId('timeline__chapter');
    await expect(chapters).toHaveCount(5);
    const footer = page.locator('footer');

    for (const [index, act] of ACTS.entries()) {
      await chapters.nth(index).click();
      await expect(footer).toContainText(`ACT ${act.numeral}`);
      // Telemetry reaches the readout on its own throttle, so poll rather than read once.
      await expect
        .poll(async () => readoutSeconds(await clockReadout(page).textContent()))
        .toBeGreaterThanOrEqual(Math.floor(act.start) + 0);
      expect(readoutSeconds(await clockReadout(page).textContent())).toBeLessThan(act.start + 5);
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

  test('Escape closes the title customiser once focus is inside it', async ({ page }) => {
    await page.getByTestId('premiere-header__customize').click();
    await expect(page.getByTestId('title-customizer__dialog')).toBeVisible();
    // The dialog moves focus itself, on the frame after it opens.
    await expect(page.getByTestId('title-customizer__close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
  });

  test('Frame Studio docks open, switches surface and dismisses', async ({ page }) => {
    // It is docked on first visit, so the reveal chip only exists once it has been dismissed.
    await expect(page.getByTestId('frame-studio__reveal')).toHaveCount(0);
    await openFrameStudio(page);

    await page.getByTestId('frame-studio__surface-border').click();
    await expect(page.getByTestId('frame-studio__border-row')).toBeVisible();
    await page.getByTestId('frame-studio__surface-sequence').click();
    await expect(page.getByTestId('frame-studio__pattern').first()).toBeVisible();

    await dismissFrameStudio(page);
    await expect(page.getByTestId('frame-studio__reveal')).toBeVisible();
  });

  test('applying a custom title jumps to the finale', async ({ page }) => {
    await page.getByTestId('premiere-header__customize').click();
    const mainTitle = page.getByTestId('title-customizer__main-title');
    await expect(mainTitle).toBeVisible();
    await mainTitle.fill('THE LAST GATSBY');
    await page.getByTestId('title-customizer__apply').click();

    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
    const chapters = page.getByTestId('timeline__chapter');
    await expect(chapters.nth(4)).toContainText('THE LAST GATSBY');
    await expect(page.locator('footer')).toContainText('ACT V');
  });
});
