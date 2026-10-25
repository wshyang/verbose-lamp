import { expect, test } from '@playwright/test';
import {
  CANVAS,
  clockReadout,
  dismissFrameStudio,
  expectHudOpacity,
  gotoLive,
  hud,
  openFrameStudio,
  press,
  readoutSeconds,
} from './support/stage';

/** Act start times in sequence seconds, and the numeral the timeline shows for each. */
const ACTS = [
  { numeral: 'I', start: 0 },
  { numeral: 'II', start: 7.2 },
  { numeral: 'III', start: 14 },
  { numeral: 'IV', start: 20.8 },
  { numeral: 'V', start: 27.5 },
] as const;

/**
 * The interactions a guest performs, against the live clock rather than a frozen frame. These
 * assert behaviour, not pixels, so they stay green across cosmetic change and catch broken
 * wiring before the likeness shots do. Software GL is slow, so controls with fixed targets are
 * pressed with `press` (no stability wait) and anything that remounts the scene is `slow`.
 */
test.describe('premiere flows', () => {
  test.beforeEach(async ({ page }) => {
    await gotoLive(page);
  });

  test('the sequence is already running and the transport pauses and resumes it', async ({ page }) => {
    const toggle = page.getByTestId('timeline__play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');

    // The clock is the scene's, not a CSS animation: it has to reach the readout.
    await expect
      .poll(async () => readoutSeconds(await clockReadout(page).textContent()), { timeout: 30_000 })
      .toBeGreaterThan(0);

    await press(page, 'timeline__play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Play sequence');
    const paused = await clockReadout(page).textContent();
    await page.waitForTimeout(2_000);
    await expect(clockReadout(page)).toHaveText(paused ?? '');

    await press(page, 'timeline__play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Pause sequence');
  });

  test('each chapter button moves the clock into that act', async ({ page }) => {
    await dismissFrameStudio(page);
    const chapters = page.getByTestId('timeline__chapter');
    await expect(chapters).toHaveCount(5);

    for (const [index, act] of ACTS.entries()) {
      // A DOM click: the chapter strip scrolls sideways, so later buttons can sit outside the
      // viewport on a phone, where a pointer click at their centre lands on nothing. The
      // handler under test is React's delegated one, and this still goes through it.
      await chapters.nth(index).evaluate((element) => (element as HTMLElement).click());
      await expect(hud(page).footer).toContainText(`ACT ${act.numeral}`);
      // Telemetry reaches the readout on its own throttle, so poll rather than read once.
      await expect
        .poll(async () => readoutSeconds(await clockReadout(page).textContent()))
        .toBeGreaterThanOrEqual(Math.floor(act.start));
      expect(readoutSeconds(await clockReadout(page).textContent())).toBeLessThan(act.start + 5);
    }
  });

  test('the scrubber and the replay button move the clock', async ({ page }) => {
    await press(page, 'timeline__play-toggle');
    const scrubber = page.getByTestId('timeline__scrubber');
    const before = await clockReadout(page).textContent();

    await scrubber.fill('30');
    await expect(scrubber).toHaveValue('30');
    await expect(clockReadout(page)).not.toHaveText(before ?? '');

    await press(page, 'timeline__replay');
    // Replay resumes playback, so assert the clock restarted near zero rather than the first frame.
    await expect
      .poll(async () => Number(await scrubber.inputValue()), { timeout: 30_000 })
      .toBeLessThan(5);
  });

  test('h hides the HUD and brings it back', async ({ page }) => {
    await dismissFrameStudio(page);
    await expectHudOpacity(page, true);

    await page.keyboard.press('h');
    await expect(hud(page).header).toHaveCSS('pointer-events', 'none');
    await expectHudOpacity(page, false);

    await page.keyboard.press('h');
    await expect(hud(page).header).toHaveCSS('pointer-events', 'auto');
    await expectHudOpacity(page, true);
  });

  test('the orbit and nitrate toggles report their state', async ({ page }) => {
    await dismissFrameStudio(page);

    for (const testId of ['premiere-header__orbit', 'premiere-header__nitrate']) {
      const toggle = page.getByTestId(testId);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await press(page, testId);
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await press(page, testId);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('o switches to the orbit camera', async ({ page }) => {
    await page.keyboard.press('o');
    await expect(page.getByTestId('premiere-header__orbit')).toHaveAttribute('aria-pressed', 'true');
  });

  test('every dialog opens from its launcher and Escape closes it', async ({ page }) => {
    await dismissFrameStudio(page);
    const dialogs = [
      { open: 'premiere-header__research', close: 'research-dialog__close' },
      { open: 'premiere-header__customize', close: 'title-customizer__close' },
      { open: 'qr-generator__launch', close: 'qr-generator__close' },
      { open: 'avatar-studio__launch', close: 'avatar-studio__close' },
    ];

    for (const dialog of dialogs) {
      await press(page, dialog.open);
      await expect(page.getByTestId(dialog.close)).toBeVisible();
      // The dialog moves focus itself on the frame after it opens; Escape works before and after.
      await page.keyboard.press('Escape');
      await expect(page.getByTestId(dialog.close)).toHaveCount(0);
    }
  });

  test('Escape closes the title customiser once focus is inside it', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'premiere-header__customize');
    await expect(page.getByTestId('title-customizer__dialog')).toBeVisible();
    await expect(page.getByTestId('title-customizer__close')).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
  });

  test('applying a custom title jumps to the finale', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'premiere-header__customize');
    await page.getByTestId('title-customizer__main-title').fill('THE LAST GATSBY');
    await page.getByTestId('title-customizer__apply').click();

    await expect(page.getByTestId('title-customizer__dialog')).toHaveCount(0);
    await expect(page.getByTestId('timeline__chapter').nth(4)).toContainText('THE LAST GATSBY');
    await expect(hud(page).footer).toContainText('ACT V');
  });

  test('Frame Studio docks open, switches surface and dismisses', async ({ page }) => {
    // Wide screens dock it open; a phone starts with it tucked behind the reveal chip.
    await openFrameStudio(page);

    await press(page, 'frame-studio__surface-border');
    await expect(page.getByTestId('frame-studio__surface-border')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('frame-studio__border-row')).toBeVisible();
    await press(page, 'frame-studio__surface-sequence');
    await expect(page.getByTestId('frame-studio__pattern').first()).toBeVisible();

    await dismissFrameStudio(page);
    await expect(page.getByTestId('frame-studio__reveal')).toBeVisible();
  });

  test('choosing the Deco Lattice foundation offers a reroll', async ({ page }) => {
    await openFrameStudio(page);
    await page.getByTestId('frame-studio__pattern').filter({ hasText: /lattice/i }).click();

    await expect(page.getByTestId('frame-studio__reroll')).toBeVisible();
  });

  test('the QR plaque opens with a live preview and a summary', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'qr-generator__launch');

    await expect(page.getByTestId('qr-generator__backdrop')).toBeVisible();
    await expect(page.getByTestId('qr-generator__preview')).toBeVisible();
    await expect(page.getByTestId('qr-generator__summary')).toContainText('modules');
  });

  test('the avatar studio opens and closes', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'avatar-studio__launch');
    await expect(page.getByTestId('avatar-studio__overlay')).toBeVisible();

    await page.getByTestId('avatar-studio__close').click();

    await expect(page.getByTestId('avatar-studio__overlay')).toHaveCount(0);
  });

  test('the spectacle console opens, plays a sparkler and closes', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'spectacle-preview__launch');
    await expect(page.getByTestId('spectacle-preview__panel')).toBeVisible();

    await page.getByTestId('spectacle-preview__sparkler').first().click();
    await expect(page.getByTestId('spectacle-layer__host').locator('canvas').first()).toBeAttached();

    await page.getByTestId('spectacle-preview__close').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toHaveCount(0);
  });

  test('spectacle origin picking only responds to the stage', async ({ page }) => {
    await dismissFrameStudio(page);
    await press(page, 'spectacle-preview__launch');
    await press(page, 'spectacle-preview__pick-origin');
    await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();

    // A click inside the console is not a click on the stage, so picking carries on.
    await page.getByTestId('spectacle-preview__panel').click({ position: { x: 24, y: 18 } });
    await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();

    // Closing the console keeps picking armed. On a phone the console spans the screen, so it
    // has to be closed before the stage is reachable at all.
    await page.getByTestId('spectacle-preview__close').click();
    await expect(page.getByTestId('spectacle-preview__panel')).toHaveCount(0);
    await expect(page.getByTestId('spectacle-preview__pick-hint')).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('Expected a viewport for the stage click');
    await page.mouse.click(viewport.width / 2, viewport.height * 0.52);
    await expect(page.getByTestId('spectacle-preview__pick-hint')).toHaveCount(0);
  });

  test('Dinner & Dance draws a canvas and Back returns to the premiere', async ({ page }) => {
    // Leaving the demo remounts the premiere's whole scene, which costs tens of seconds on software GL.
    test.slow();
    await dismissFrameStudio(page);
    await press(page, 'event-night__launch');
    const screen = page.getByTestId('event-night__screen');
    await expect(screen).toBeVisible();

    // A mounted screen is not a drawn one: the ambient stage needs a canvas with a real buffer.
    const stage = screen.locator('canvas').first();
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const size = await stage.evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);

    await page.getByTestId('event-night__back').click({ timeout: 60_000 });
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 120_000 });
  });
});
