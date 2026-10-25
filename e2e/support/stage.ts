import { expect, type Page } from '@playwright/test';

/** Freeze options shared by the likeness and flow specs. */
export interface FrozenOptions {
  /** `false` hides the HUD so the screenshot is of the film alone. */
  hud?: boolean;
  nitrate?: boolean;
  orbit?: boolean;
}

const READY_TIMEOUT_MS = 20_000;
const SETTLE_MS = 600;

/**
 * Which renderer to shoot (ADDENDUM-022 §6 step 2.5). Unset means the app's default,
 * `GatsbySceneManager`. `PREMIERE_RENDERER=r3f` puts the whole likeness gate on the
 * React Three Fiber port, so the port can be judged against the *unchanged* baselines
 * rather than against a fresh set of its own.
 */
const RENDERER = process.env.PREMIERE_RENDERER?.trim();

const stageUrl = (seconds: number): string => {
  const base = `/?freezeAt=${seconds}`;
  return RENDERER ? `${base}&renderer=${encodeURIComponent(RENDERER)}` : base;
};

/**
 * Opens the premiere pinned to one frame and waits for three composited
 * frames. `?freezeAt=` stops playback and pointer aim (ADDENDUM-027 §3), so
 * the capture is reproducible.
 */
export async function gotoFrozen(page: Page, seconds: number, options: FrozenOptions = {}): Promise<void> {
  await page.goto(stageUrl(seconds));
  const stage = page.getByTestId('cinematic-stage__canvas');
  await expect(stage).toHaveAttribute('data-frame-ready', 'true', { timeout: READY_TIMEOUT_MS });
  if (options.hud === false) await page.keyboard.press('h');
  // These are toggles with a fixed target: forcing the click skips Playwright's
  // stability wait, which software GL never satisfies while the film renders.
  if (options.nitrate) {
    await page.getByTestId('premiere-header__nitrate').click({ force: true, timeout: 60_000 });
  }
  if (options.orbit) {
    await page.getByTestId('premiere-header__orbit').click({ force: true, timeout: 60_000 });
  }
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * Closes the Frame Studio, which docks beside the film on wide screens but
 * covers the header and transport on phones. Call it before driving the HUD.
 */
export async function dismissFrameStudio(page: Page): Promise<void> {
  const dismiss = page.getByTestId('frame-studio__dismiss');
  if ((await dismiss.count()) > 0 && (await dismiss.isVisible())) {
    await dismiss.click();
    await expect(page.getByTestId('frame-studio__panel')).toHaveCount(0);
  }
}

/** Frozen premiere with the HUD hidden: the likeness baseline shot. */
export async function gotoFrame(page: Page, seconds: number): Promise<void> {
  await gotoFrozen(page, seconds, { hud: false });
}
