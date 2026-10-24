import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiSignIn, seeded, signInStaff, stamp } from '../support/fixtures.js';

/**
 * ADR-284 — the court console's Line-ups subtab, in a real browser, on the shared stack.
 *
 * The shared dev database never has a live tournament (starting one is the full-event spec's job, on a
 * database of its own), so this proves the half that does not need one: a marshal reaches the subtab
 * from the court, it says so plainly when nothing is planned there, and the strip takes them back to
 * the console they came from. The populated list is asserted by `e2e/full-event/full-event.spec.ts`.
 */

/**
 * Court 1, through the desk API. Idempotent on the number — the demo seed and the full-event spec both
 * create it — so a fresh dev database gains the court every venue has, and a seeded one is untouched.
 */
async function courtOneId(request: APIRequestContext): Promise<string> {
  await apiSignIn(request, '/api/auth/superadmins/signin', seeded.superadmin);
  const created = await request.post('/api/admin/tournament/courts', { data: { courtNumber: 1, label: 'Court 1' } });
  expect([201, 409], await created.text()).toContain(created.status());
  const response = await request.get('/api/admin/tournament');
  expect(response.ok()).toBe(true);
  const { courts } = (await response.json()) as { courts: { id: string; courtNumber: number }[] };
  const court = courts.find((row) => row.courtNumber === 1);
  expect(court, 'court 1 exists').toBeDefined();
  return court?.id ?? '';
}

test.describe('ADR-284 — a court’s Line-ups subtab', () => {
  test('says nothing is planned here yet, and the strip goes back to the console', async ({ page, request }) => {
    const courtId = await courtOneId(request);

    await signInStaff(page, 'court1');
    await page.goto(`/staff/court/${courtId}/lineups`);
    await expect(page.getByTestId('court-tabs__lineups')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('court-lineups__empty')).toHaveText('Nothing planned on this court yet.');
    await page.screenshot({ path: `screenshots/ft-court-lineups-empty-${stamp()}.png`, fullPage: true });

    await page.getByTestId('court-tabs__console').click();
    await expect(page).toHaveURL(new RegExp(`/staff/court/${courtId}$`));
    await expect(page.getByTestId('court__start')).toBeVisible();
  });
});
