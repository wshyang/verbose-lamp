import { expect, test } from '@playwright/test';
import { signInSuperadmin, stamp } from '../support/fixtures.js';

/**
 * ADR-279/288 — the Tournament tab's three subtabs, in a real browser, without starting anything.
 *
 * Parallel-safe on purpose: it reads, rehearses and opens forms, and writes nothing. Starting a day is
 * the full-event spec's job (`e2e/full-event/`, its own database), and editing a court would change
 * the venue every other file on the shared stack reads, so neither happens here.
 *
 * What a real browser proves that the jsdom page tests cannot: the subtab strip navigates, and the
 * Simulator runs the engine bundled for the browser (`@psd/tournament/scheduler`) and plans a day.
 */

test.describe('the Tournament tab', () => {
  test('Control, Timetable and Simulator are one strip, each reachable from the others', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament');
    await expect(page.getByTestId('tournament-courts')).toBeVisible();
    await expect(page.getByTestId('tournament-tabs__tab')).toHaveText(['Control', 'Timetable', 'Simulator']);

    await page.getByTestId('tournament-tabs__tab').filter({ hasText: 'Timetable' }).click();
    await expect(page).toHaveURL(/\/admin\/tournament\/timetable$/);
    await expect(page.getByTestId('timetable__fit')).toBeVisible();

    await page.getByTestId('tournament-tabs__tab').filter({ hasText: 'Simulator' }).click();
    await expect(page).toHaveURL(/\/admin\/tournament\/simulator$/);
    await expect(page.getByTestId('simulator__knobs')).toBeVisible();

    await page.getByTestId('tournament-tabs__tab').filter({ hasText: 'Control' }).click();
    await expect(page).toHaveURL(/\/admin\/tournament$/);
  });

  test('the Simulator plans a day in the browser, and refuses one the format cannot play', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament/simulator');
    // The Simulator seeds Teams and Courts once, when the console's answer arrives, and that seed
    // overwrites anything already typed. Wait for it, or a slow answer turns six teams into two.
    await expect(page.getByTestId('simulator__room')).toContainText('registered');

    // Rehearse a fixed room, so the answer does not depend on how many teams other files made.
    await page.getByTestId('simulator__format').selectOption('round_robin');
    await page.getByTestId('simulator__teamCount').fill('6');
    await page.getByTestId('simulator__courtCount').fill('2');
    // Six teams, everyone once: fifteen matches.
    await expect(page.getByTestId('simulator__row')).toHaveCount(15);
    await expect(page.getByTestId('simulator__fit')).toContainText('15 matches');
    await page.screenshot({ path: `screenshots/ft-simulator-${stamp()}.png`, fullPage: true });

    await page.getByTestId('simulator__format').selectOption('groups_knockout');
    await page.getByTestId('simulator__teamCount').fill('3');
    await expect(page.getByTestId('simulator__error')).toBeVisible();
    await expect(page.getByTestId('simulator__row')).toHaveCount(0);
  });

  test('the Courts form offers an add, and an edit it can back out of', async ({ page }) => {
    await signInSuperadmin(page);
    await page.goto('/admin/tournament');
    const panel = page.getByTestId('tournament-courts');
    await expect(panel.getByTestId('tournament-courts__submit')).toHaveText('Add court');
    // The demo and every e2e run have at least one court; a bare database is the empty state instead.
    const rows = panel.getByTestId('tournament-courts__row');
    await expect(rows.first().or(panel.getByTestId('tournament-courts__empty'))).toBeVisible();
    if ((await rows.count()) === 0) return;
    await rows.first().getByTestId('tournament-courts__edit').click();
    await expect(panel.getByTestId('tournament-courts__submit')).toHaveText('Save court');
    await expect(panel.getByTestId('tournament-courts__number')).not.toHaveValue('');
    await panel.getByTestId('tournament-courts__cancel').click();
    await expect(panel.getByTestId('tournament-courts__submit')).toHaveText('Add court');
  });
});
