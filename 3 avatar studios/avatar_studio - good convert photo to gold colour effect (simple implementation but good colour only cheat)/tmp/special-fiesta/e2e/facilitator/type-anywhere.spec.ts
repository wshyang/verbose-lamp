import { expect, test, type APIRequestContext } from '@playwright/test';
import { apiSignIn, seeded, signInStaff, unique } from '../support/fixtures.js';

/**
 * ADR-105 — typing anywhere on a station page lands in its number box.
 *
 * The jsdom test for this (`routes-facilitator/station-pages.test.tsx`) can only go half way,
 * and the half it cannot reach is the half the feature is made of. It dispatches a synthetic
 * `keydown` and asserts the input took focus — but a synthetic event has **no default action**,
 * so nothing can check the claim the implementation actually rests on:
 *
 *   "focus the input during keydown and the browser's own default then delivers that same
 *    keystroke into it"
 *
 * That sentence is either true of a real browser or the feature does not work, and jsdom is
 * structurally unable to answer. Here the key is pressed for real, so the digit either arrives
 * in the box or it does not — which is also precisely what a scan gun does, firing four digits
 * at a page nobody has tapped.
 *
 * It is worth noting that the jsdom test has also flaked once, unreproducibly
 * (`docs/outstanding-tasks.md` §15). This spec does not replace it; it covers the mechanism
 * from the other side, on an engine where focus and key defaults are real.
 */

async function createActivity(request: APIRequestContext, name: string): Promise<string> {
  await apiSignIn(request, '/api/auth/superadmins/signin', {
    username: seeded.superadmin.username,
    passcode: seeded.superadmin.passcode,
  });
  const response = await request.post('/api/admin/activities', {
    data: { activityName: name, awardTiers: [{ label: 'Win', points: 15 }] },
  });
  if (!response.ok()) {
    throw new Error(`create activity failed: ${response.status()} ${await response.text()}`);
  }
  const { activity } = (await response.json()) as { activity: { id: string } };
  return activity.id;
}

test.describe('ADR-105 — a station takes typing with no tap', () => {
  test('a real keystroke on the page body lands in the number box', async ({ page, request }) => {
    // `unique()` carries the worker-unique run id, so parallel workers cannot collide on the
    // activity name (the API rejects a duplicate with 409).
    const activityId = await createActivity(request, unique('Tug of war'));

    await signInStaff(page, 'court1');
    await page.goto(`/staff/activity/${activityId}`);
    await page.getByTestId('fringe__open-round').click();

    const box = page.getByTestId('fringe__number');
    await expect(box).toBeVisible();
    await expect(box).toBeEnabled();
    // Nothing is focused yet: this is the state a marshal's phone is in, sitting on the rail.
    await expect(box).not.toBeFocused();

    await page.keyboard.press('1');

    // Both halves of ADR-105, and the second one is the one jsdom cannot see: the box took
    // focus, AND the keystroke that caused it was not swallowed on the way.
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('1');
  });

  test('a four-digit scan gun burst arrives whole and in order', async ({ page, request }) => {
    const activityId = await createActivity(request, unique('Relay'));

    await signInStaff(page, 'court1');
    await page.goto(`/staff/activity/${activityId}`);
    await page.getByTestId('fringe__open-round').click();
    await expect(page.getByTestId('fringe__number')).toBeEnabled();

    /*
     * A scan gun is a keyboard that types very fast at whatever has focus — which at the first
     * digit is the page body, not the box. If the focus hand-off dropped or reordered that
     * first character, the station would read every scan with its leading digit missing, and
     * the four-digit number would never submit (ADR-085 submits on the fourth).
     */
    await page.keyboard.type('4821', { delay: 0 });

    await expect(page.getByTestId('fringe__number')).toHaveValue('4821');
  });
});
