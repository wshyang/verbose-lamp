import { expect, type Locator, type Page } from '@playwright/test';

/** The WebGL mount; it carries `data-frame-ready` once the frame is composited on screen. */
export const CANVAS = '[data-testid="cinematic-stage__canvas"]';

export interface FrozenStageOptions {
  /** Keep the header, transport and Frame Studio visible. Off by default, so shots show the film alone. */
  hud?: boolean;
  /** Force the silver-nitrate look (a header toggle; there is no shortcut). */
  nitrate?: boolean;
  /** Switch to the free orbit camera. */
  orbit?: boolean;
}

const READY_TIMEOUT_MS = 60_000;
const CLICK_TIMEOUT_MS = 60_000;

/**
 * A click on a control with a fixed target. Playwright's stability check waits for the element
 * to stop moving between frames, and on software GL the render loop can outlast it, so these
 * skip the check; the control is still found by test id, so a missing one still fails.
 */
export function press(page: Page, testId: string): Promise<void> {
  return page.getByTestId(testId).click({ force: true, timeout: CLICK_TIMEOUT_MS });
}

/** Two animation frames: whatever was just clicked has reached the renderer. */
export function nextPaint(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export async function waitForFrameReady(page: Page): Promise<void> {
  await expect(page.locator(`${CANVAS}[data-frame-ready="true"]`)).toBeAttached({ timeout: READY_TIMEOUT_MS });
}

/** The live, playing premiere with its first frame on screen. */
export async function gotoLive(page: Page): Promise<void> {
  await page.goto('/');
  await waitForFrameReady(page);
}

/**
 * Opens the premiere pinned to `seconds` (`?freezeAt=` stops the clock and the pointer aim) and
 * waits for a composited frame. Header toggles are applied before the HUD is hidden, because
 * hiding it also hides them.
 */
export async function gotoFrozen(page: Page, seconds: number, options: FrozenStageOptions = {}): Promise<void> {
  await page.goto(`/?freezeAt=${seconds}`);
  await waitForFrameReady(page);

  if (options.orbit) {
    await press(page, 'premiere-header__orbit');
    await expect(page.getByTestId('premiere-header__orbit')).toHaveAttribute('aria-pressed', 'true');
  }
  if (options.nitrate) {
    await press(page, 'premiere-header__nitrate');
    await expect(page.getByTestId('premiere-header__nitrate')).toHaveAttribute('aria-pressed', 'true');
  }
  if (options.hud !== true) {
    await dismissFrameStudio(page);
    await hideHud(page);
  }
  await nextPaint(page);
}

/** The header fades to opacity 0 and drops pointer events; the footer does the same. */
export function hud(page: Page): { header: Locator; footer: Locator } {
  return {
    header: page.locator('header', { has: page.getByRole('navigation', { name: 'Premiere tools' }) }),
    footer: page.locator('footer'),
  };
}

const opacityOf = (locator: Locator) => locator.evaluate((el) => Number(getComputedStyle(el).opacity));

/** The fade is a CSS transition, so poll the computed opacity rather than pin an instant. */
export async function expectHudOpacity(page: Page, visible: boolean): Promise<void> {
  const { header } = hud(page);
  await expect
    .poll(() => opacityOf(header), { timeout: 20_000 })
    [visible ? 'toBeGreaterThan' : 'toBeLessThan'](visible ? 0.9 : 0.1);
}

export async function hideHud(page: Page): Promise<void> {
  await page.keyboard.press('h');
  await expectHudOpacity(page, false);
}

/** The studio docks open on first visit on a wide screen; this leaves it open. */
export async function openFrameStudio(page: Page): Promise<void> {
  if ((await page.getByTestId('frame-studio__panel').count()) === 0) {
    await press(page, 'frame-studio__reveal');
  }
  await expect(page.getByTestId('frame-studio__panel')).toBeVisible();
}

/** It docks beside the film on wide screens but covers the transport on phones; close it before driving the HUD. */
export async function dismissFrameStudio(page: Page): Promise<void> {
  const dismiss = page.getByTestId('frame-studio__dismiss');
  if ((await dismiss.count()) > 0 && (await dismiss.isVisible())) {
    await dismiss.click();
    await expect(page.getByTestId('frame-studio__panel')).toHaveCount(0);
  }
}

/** Opens the studio, enables the screen border on its own surface, and leaves the studio open. */
export async function enableScreenBorder(page: Page): Promise<void> {
  await openFrameStudio(page);
  await press(page, 'frame-studio__surface-border');
  const enable = page.getByTestId('frame-studio__border-enable');
  if (!(await enable.isChecked())) await enable.check();
  await expect(enable).toBeChecked();
}

/** The Deco Lattice foundation for the title card and the lattice pattern for the border, both on. */
export async function enableLatticeBrass(page: Page): Promise<void> {
  await openFrameStudio(page);
  await page.getByTestId('frame-studio__pattern').filter({ hasText: /lattice/i }).click();
  await enableScreenBorder(page);
  await page.getByTestId('frame-studio__border-pattern').filter({ hasText: /lattice/i }).click();
  await expect(page.getByTestId('frame-studio__border-reroll')).toBeVisible();
}

/** The `00:11 / 00:38` readout in the timeline. */
export function clockReadout(page: Page): Locator {
  return page.locator('footer').getByText(/^\d\d:\d\d\s+\/\s+\d\d:\d\d$/);
}

/** `00:11 / 00:38` becomes 11. */
export function readoutSeconds(text: string | null): number {
  const [minutes, seconds] = (text ?? '').slice(0, 5).split(':');
  return Number(minutes) * 60 + Number(seconds);
}
