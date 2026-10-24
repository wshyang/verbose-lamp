import { expect, test, type Page } from '@playwright/test';

/**
 * ADR-265 / ADR-317 — the phone type scale, read from computed style.
 *
 * The scale lives in an `@media (max-width: 600px)` block. A media query adds no specificity, so
 * it only wins if it comes after the base rules it overrides; for a long time it did not, and
 * every pixel-type step silently stayed at its desktop size while the stylesheet test (which only
 * looked for the declarations) stayed green. Only a browser can say which declaration won.
 */

const PHONE = { width: 412, height: 839 };
const DESKTOP = { width: 1280, height: 800 };

async function fontSize(page: Page, selector: string): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
}

test.describe('the phone type scale (ADR-265, ADR-317)', () => {
  test('steps the pixel type up one notch on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('.gb-banner h1').first()).toBeVisible();

    expect(await fontSize(page, '.theme-gameboy'), 'reading face').toBe('22px');
    expect(await fontSize(page, '.gb-banner h1'), 'banner title').toBe('16px');
    expect(await fontSize(page, '.gb-banner p'), 'banner subtitle').toBe('10px');
    expect(await fontSize(page, '.gb-panel h2'), 'panel heading').toBe('12px');
    expect(await fontSize(page, '.gb-button'), 'button').toBe('12px');
  });

  test('leaves the desktop sizes alone above 600px', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/');
    await expect(page.locator('.gb-banner h1').first()).toBeVisible();

    expect(await fontSize(page, '.gb-banner h1'), 'banner title').toBe('15px');
    expect(await fontSize(page, '.gb-banner p'), 'banner subtitle').toBe('9px');
    expect(await fontSize(page, '.gb-panel h2'), 'panel heading').toBe('11px');
    expect(await fontSize(page, '.gb-button'), 'button').toBe('11px');
  });
});
