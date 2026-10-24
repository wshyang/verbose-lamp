import { expect, test, type Locator, type Page } from '@playwright/test';
import { fieldHelp } from '@psd/contracts';
import { signInSuperadmin, stamp } from '../support/fixtures.js';

/**
 * ADR-319 — the (i) beside each tournament field, in a real browser.
 *
 * jsdom applies no stylesheet, so the unit tests can prove the wiring but not that the tooltip is
 * *seen*, that it is the copy the contract owns, that it stays on the screen, or that it really
 * goes when the pointer or focus leaves (AGENTS-testing §1.1). Read-only and parallel-safe, like
 * the other superadmin specs: it opens forms and hovers, and writes nothing.
 */

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

function fieldOf(page: Page, testId: string): Locator {
  return page.getByTestId('console-field').filter({ has: page.getByTestId(testId) });
}

/** The Simulator fills in its room line after a fetch, which moves everything below it; wait for that before aiming a pointer. */
async function openSimulator(page: Page) {
  await page.goto('/admin/tournament/simulator');
  await expect(page.getByTestId('simulator__room')).toContainText('registered');
}

async function expectOnScreen(tooltip: Locator, page: Page) {
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('no box for the tooltip');
  expect(box.x, 'starts inside the left edge').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'ends inside the right edge').toBeLessThanOrEqual(viewport.width);
}

for (const [name, size] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
  test.describe(`the field help on a ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(size);
      await signInSuperadmin(page);
    });

    test('shows the contract’s words on hover and removes them when the pointer leaves', async ({ page }) => {
      await openSimulator(page);
      const field = fieldOf(page, 'simulator__teamCount');
      const trigger = field.getByTestId('field-help__trigger');
      const tooltip = field.getByTestId('field-help__tooltip');
      await expect(tooltip).toBeHidden();

      await trigger.hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveText(fieldHelp.simulatorTeams);
      await expectOnScreen(tooltip, page);
      await page.screenshot({ path: `screenshots/ft-field-help-${name}-${stamp()}.png` });

      await page.mouse.move(2, 2);
      await expect(tooltip).toBeHidden();
    });

    test('shows on keyboard focus and removes the tooltip when focus moves on', async ({ page }) => {
      await openSimulator(page);
      const field = fieldOf(page, 'simulator__courtCount');
      const trigger = field.getByTestId('field-help__trigger');
      const tooltip = field.getByTestId('field-help__tooltip');

      await trigger.focus();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveText(fieldHelp.simulatorCourts);
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('simulator__courtCount')).toBeFocused();
      await expect(tooltip).toBeHidden();
    });

    test('a press keeps it up; a press elsewhere, or Escape, takes it away', async ({ page }) => {
      await openSimulator(page);
      const field = fieldOf(page, 'simulator__matchMinutes');
      const trigger = field.getByTestId('field-help__trigger');
      const tooltip = field.getByTestId('field-help__tooltip');

      await trigger.click();
      await page.mouse.move(2, 2);
      await expect(tooltip).toBeVisible();
      await page.getByRole('heading', { name: 'The day to rehearse' }).click();
      await expect(tooltip).toBeHidden();

      await trigger.click();
      await expect(tooltip).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tooltip).toBeHidden();
    });

    test('only one field’s help is open at a time', async ({ page }) => {
      await openSimulator(page);
      const first = fieldOf(page, 'simulator__teamCount');
      const second = fieldOf(page, 'simulator__courtCount');
      await first.getByTestId('field-help__trigger').click();
      await expect(first.getByTestId('field-help__tooltip')).toBeVisible();
      await second.getByTestId('field-help__trigger').click();
      await expect(second.getByTestId('field-help__tooltip')).toBeVisible();
      await expect(first.getByTestId('field-help__tooltip')).toBeHidden();
    });

    test('a field in the last column stays on the screen', async ({ page }) => {
      await openSimulator(page);
      const field = fieldOf(page, 'simulator__deadline');
      await field.getByTestId('field-help__trigger').hover();
      const tooltip = field.getByTestId('field-help__tooltip');
      await expect(tooltip).toBeVisible();
      await expectOnScreen(tooltip, page);
    });

    test('the Courts form on the Control tab explains the court number', async ({ page }) => {
      await page.goto('/admin/tournament');
      // The console renders its forms while it is still loading and rearranges them when the answer
      // arrives (a draft or a live day replaces the new-tournament form), which moves the Courts form
      // out from under a pointer resting on its icon. Hover only once the loading line has gone.
      await expect(page.getByTestId('tournament-control__loading')).toHaveCount(0);
      await expect(page.getByTestId('tournament-setup')).toBeVisible();
      const field = fieldOf(page, 'tournament-courts__number');
      const tooltip = field.getByTestId('field-help__tooltip');
      await field.getByTestId('field-help__trigger').hover();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toHaveText(fieldHelp.courtNumber);
      await expectOnScreen(tooltip, page);
    });

    test('keeps Programme controls on one line when their labels wrap differently', async ({ page }) => {
      test.skip(name !== 'desktop', 'the phone layout stacks these fields in one column');
      await page.goto('/admin/agenda');
      await expect(page.getByTestId('agenda__form')).toBeVisible();
      const controls = ['agenda__title', 'agenda__start', 'agenda__end', 'agenda__location'].map((testId) =>
        page.getByTestId(testId),
      );
      const boxes = await Promise.all(controls.map(async (control) => control.boundingBox()));
      if (boxes.some((box) => box === null)) throw new Error('no box for a Programme control');
      const tops = boxes.map((box) => box?.y ?? 0);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      const triggerMarginTop = await page
        .getByTestId('field-help__trigger')
        .first()
        .evaluate((trigger) => getComputedStyle(trigger.parentElement as HTMLElement).marginTop);
      expect(triggerMarginTop).toBe('0px');
    });

    test('every field on the Simulator points at a tooltip that exists', async ({ page }) => {
      await openSimulator(page);
      const knobs = page.getByTestId('simulator__knobs');
      const controls = knobs.locator('input, select');
      const count = await controls.count();
      expect(count).toBeGreaterThanOrEqual(12);
      for (let index = 0; index < count; index += 1) {
        const id = await controls.nth(index).getAttribute('aria-describedby');
        expect(id, `control ${index} has no aria-describedby`).toBeTruthy();
        await expect(page.locator(`[id="${id}"][role="tooltip"]`)).toHaveCount(1);
      }
    });
  });
}
