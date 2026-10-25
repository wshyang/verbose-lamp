import { expect, test, type Page } from '@playwright/test';
import { dismissFrameStudio, gotoFrozen } from './support/stage';

/**
 * Interaction flows (ADDENDUM-022 §4). These assert behaviour, not pixels, so
 * they stay green across cosmetic changes and catch broken wiring before the
 * likeness shots do.
 *
 * Software GL is slow here: HUD clicks are forced (they have fixed targets and
 * Playwright's stability wait can outlast the render loop) and each flow that
 * remounts the scene is declared slow.
 */
const launch = (page: Page, testId: string) =>
  page.getByTestId(testId).click({ force: true, timeout: 60_000 });

test.describe('premiere flows', () => {
  test('transport: replay, scrub and chapter selection move the frame', async ({ page }) => {
    // HUD stays up: the transport bar is part of it, and hiding the HUD also
    // releases pointer events to the canvas underneath.
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);

    // Chapters expose their selection as `aria-pressed` (a Button variant), not
    // `aria-current`; the nav itself is labelled "Sequence chapters".
    const chapters = page.getByTestId('timeline__chapter');
    await page.getByTestId('timeline__replay').click();
    await expect(chapters.first()).toHaveAttribute('aria-pressed', 'true');

    await chapters.nth(2).click();
    await expect(chapters.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(chapters.first()).toHaveAttribute('aria-pressed', 'false');

    const scrubber = page.getByTestId('timeline__scrubber');
    await scrubber.fill('30');
    await expect(scrubber).toHaveValue('30');
  });

  test('play/pause label follows playback and h hides the HUD', async ({ page }) => {
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);
    const toggle = page.getByTestId('timeline__play-toggle');
    // The opacity lives on the <header> wrapper, not the <nav>: a hidden HUD keeps
    // its own computed opacity at 1, so assert on the element that actually fades.
    const header = page.locator('header', {
      has: page.getByRole('navigation', { name: 'Premiere tools' }),
    });

    // Frozen playback is paused by definition, so the first press plays.
    await toggle.click({ force: true });
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
    await toggle.click({ force: true });
    await expect(toggle).toHaveAttribute('aria-label', 'Play sequence');

    await page.keyboard.press('h');
    await expect(header).toHaveCSS('opacity', '0');
    await page.keyboard.press('h');
    await expect(header).toHaveCSS('opacity', '1');
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
    await dismissFrameStudio(page);
    await launch(page, 'spectacle-preview__launch');
    await expect(page.getByTestId('spectacle-preview__panel')).toBeVisible();
    await page.getByTestId('spectacle-preview__sparkler').first().click();
    await page.getByTestId('spectacle-preview__panel').getByRole('button', { name: /sparkler fan/i }).click();
    await page.getByTestId('spectacle-preview__close').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toHaveCount(0);
  });

  test('the golden QR plaque opens, carries a live preview and closes on Escape', async ({ page }) => {
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);

    await launch(page, 'qr-generator__launch');

    await expect(page.getByTestId('qr-generator__backdrop')).toBeVisible();
    await expect(page.getByTestId('qr-generator__preview')).toBeVisible();
    await expect(page.getByTestId('qr-generator__summary')).toContainText('modules');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('qr-generator__backdrop')).toHaveCount(0);
  });

  test('the avatar studio opens on its sample portrait and closes', async ({ page }) => {
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);

    await launch(page, 'avatar-studio__launch');

    await expect(page.getByTestId('avatar-studio__overlay')).toBeVisible();
    await page.getByTestId('avatar-studio__close').click();
    await expect(page.getByTestId('avatar-studio__overlay')).toHaveCount(0);
  });

  test('the title customizer opens and applies a custom title', async ({ page }) => {
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);

    await launch(page, 'premiere-header__customize');

    await expect(page.getByTestId('title-customizer__dialog')).toBeVisible();
    await page.getByTestId('title-customizer__main-title').fill('JAZZ AGE');
    await page.getByTestId('title-customizer__apply').click();

    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
    // Applying a title jumps to the hero act (V).
    await expect(page.getByTestId('timeline__chapter').nth(4)).toHaveAttribute('aria-pressed', 'true');
  });

  test('event night opens and returns to the premiere', async ({ page }) => {
    // Leaving event night remounts the premiere's whole three.js scene, which
    // costs tens of seconds on a software GL stack.
    test.slow();
    await gotoFrozen(page, 12);
    await dismissFrameStudio(page);
    await launch(page, 'event-night__launch');
    await expect(page.getByTestId('event-night__back')).toBeVisible();
    // The click hands the main thread to the premiere's scene build; on SwiftShader that
    // can occupy it for over a minute, so the action itself needs the long timeout, not
    // just the assertion after it. `noWaitAfter` keeps Playwright from waiting on the
    // navigation it will never see.
    await page
      .getByTestId('event-night__back')
      .click({ timeout: 180_000, noWaitAfter: true });
    await expect(page.getByTestId('cinematic-stage__canvas')).toBeVisible({ timeout: 120_000 });
  });
});
