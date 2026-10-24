import { expect, test } from '@playwright/test';
import { typeInto, unique } from '../support/fixtures.js';

/**
 * Reported bug: "participants cannot sign out — pressing Sign out leaves them signed in."
 *
 * Every layer below this one already passed. The API invalidates the session row and clears the
 * cookie (apps/api/src/tests/auth.test.ts, session-cookie.test.ts), and the component tests
 * assert that pressing the button sends `POST /api/auth/signout`
 * (routes-participant/participant-pages.test.tsx) and that the location trail is forgotten
 * (acceptance/location-memory.test.tsx). All of them assert the CALL; none asserts the OUTCOME —
 * that the person is afterwards actually signed out, and stays that way across a reload.
 *
 * That gap is why this needs a real browser: the signed-out state is only observable once real
 * navigation, real storage and a real reload are in play.
 */

test.describe('F3 — signing out', () => {
  test('signs the participant out, and a reload does not let them back in', async ({ page }) => {
    const nickname = unique('Signout');

    await page.goto('/signup');
    await typeInto(page.getByTestId('signup-form__nickname'), nickname);
    await typeInto(page.getByTestId('signup-form__pin'), '4821');
    await page.getByTestId('signup-form__cluster').selectOption('ITC');
    await page.getByTestId('signup-form__gender-female').click();
    await page.getByTestId('signup-form__avatar').first().click();
    await page.getByTestId('signup-form__submit').click();
    await page.waitForURL('**/home');

    await page.goto('/me');
    await page.getByTestId('profile__signout').click();

    // The outcome, not the call: the front door, offering a way back IN.
    await expect(page.getByTestId('landing__signin')).toBeVisible();

    // And it has to survive the thing every real person does next.
    await page.reload();
    await expect(page.getByTestId('landing__signin')).toBeVisible();

    // A guarded route must now bounce rather than serve.
    await page.goto('/me');
    await expect(page.getByTestId('profile__signout')).toHaveCount(0);
  });
});
