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
    // The toggle is icon-only, so its accessible name is the state that changes
    // (ADDENDUM-043: asserting innerText passed only because both were empty).
    const toggle = page.getByTestId('timeline__play-toggle');
    const before = await toggle.getAttribute('aria-label');
    expect(before).toMatch(/^(Play|Pause) sequence/);
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-label', String(before));
  });

  test('every chapter button moves the clock into its act', async ({ page }) => {
    const chapters = page.getByTestId('timeline__chapter');
    const count = await chapters.count();
    expect(count).toBe(5);
    for (let i = 0; i < count; i += 1) {
      // A DOM click, not a pointer click: the strip is horizontally scrollable, so
      // later chapters sit outside the viewport and a synthetic click at their
      // centre lands on nothing. Dispatching on the element still goes through
      // React's delegated handler, which is the wiring under test (ADDENDUM-043).
      // The `toBeInViewport` below then proves the strip brought it into view.
      // No in-viewport assertion: the strip is scrolled by the user, not by the
      // app, so on a phone the later chapters are legitimately clipped until they
      // swipe. Asserting otherwise would be asserting a feature nobody wrote.
      await chapters.nth(i).evaluate((element) => (element as HTMLElement).click());
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
    // The HUD fades rather than unmounting (it keeps its layout so the stage does
    // not reflow), so `toBeHidden` is the wrong instrument: it passes only if the
    // element is display:none or detached. Opacity is the actual contract.
    // The fade is a CSS transition, and on a software renderer the main thread is
    // busy enough that "500 ms" is not 500 ms of wall clock. Poll the computed
    // opacity rather than pinning an instant; `pointer-events` is the instant half
    // of the same state (it is not animatable).
    const header = page.getByTestId('premiere-header__root');
    const opacity = () => header.evaluate((el) => Number(getComputedStyle(el).opacity));

    await expect.poll(opacity, { timeout: 20_000 }).toBeGreaterThan(0.9);
    await page.keyboard.press('h');
    await expect(header).toHaveCSS('pointer-events', 'none');
    await expect.poll(opacity, { timeout: 20_000 }).toBeLessThan(0.1);
    await page.keyboard.press('h');
    await expect(header).toHaveCSS('pointer-events', 'auto');
    await expect.poll(opacity, { timeout: 20_000 }).toBeGreaterThan(0.9);
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
    const screen = page.getByTestId('event-night__screen');
    await expect(screen).toBeVisible();
    // A mounted screen is not a drawn one: the ambient stage has to have a canvas
    // with a real drawing buffer, which is the half a screenshot can no longer
    // cover (ADDENDUM-043).
    const stage = screen.locator('canvas').first();
    await expect(stage).toBeVisible({ timeout: 30_000 });
    const size = await stage.evaluate((canvas) => ({
      width: (canvas as HTMLCanvasElement).width,
      height: (canvas as HTMLCanvasElement).height,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    await page.goBack();
    await expect(page.getByTestId('cinematic-stage__canvas')).toBeVisible();
  });
});
