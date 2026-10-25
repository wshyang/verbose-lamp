import { expect, test } from '@playwright/test';
import { typeInto, unique } from '../support/fixtures.js';

/**
 * fds.md §6.5 — F1 acceptance: "Given I am on the sign-up screen, when I enter a valid unique
 * nickname, a 4-digit PIN, select my cluster, gender and avatar, then my Participant record is
 * created and I land on the home screen signed in."
 */

test.describe('F1 — participant sign-up (S1)', () => {
  test('creates the participant and lands signed in on the home screen', async ({ page }) => {
    const nickname = unique('Amira');

    await page.goto('/signup');
    await typeInto(page.getByTestId('signup-form__nickname'), nickname);
    await typeInto(page.getByTestId('signup-form__pin'), '4821');
    await page.getByTestId('signup-form__cluster').selectOption('ITC');
    await page.getByTestId('signup-form__gender-female').click();
    await page.getByTestId('signup-form__avatar').first().click();
    await page.getByTestId('signup-form__submit').click();

    await page.waitForURL('**/home');
    await expect(page.getByText(nickname, { exact: false }).first()).toBeVisible();

    // The session is long-lived: a reload must not bounce the participant to sign-in (F3).
    await page.reload();
    await expect(page).toHaveURL(/\/home/);
  });

  /*
   * ADR-076 — reported bug: "the gender buttons when selected do not give sufficient visual cues to
   * let you see that a button is selected."
   *
   * Both buttons always carried `aria-pressed`, so every DOM-level assertion in the suite passed
   * while the two rendered identically — `gb-button` had no pressed styling at all. This asserts the
   * *computed* style, which is the only layer where the defect was visible, and it needs a real
   * browser: jsdom resolves no stylesheet, so the acceptance suite cannot catch this class of bug.
   */
  test('shows which gender is selected, not just announces it (ADR-076)', async ({ page }) => {
    await page.goto('/signup');
    const male = page.getByTestId('signup-form__gender-male');
    const female = page.getByTestId('signup-form__gender-female');
    const paint = (target: typeof male) =>
      target.evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.backgroundColor}|${style.boxShadow}`;
      });

    await expect(male).toHaveAttribute('aria-pressed', 'false');
    await expect(female).toHaveAttribute('aria-pressed', 'false');
    expect(await paint(male)).toBe(await paint(female));

    await female.click();

    await expect(female).toHaveAttribute('aria-pressed', 'true');
    // The chosen one must look different from the one beside it, and from its own unchosen self.
    expect(await paint(female)).not.toBe(await paint(male));

    await male.click();

    await expect(male).toHaveAttribute('aria-pressed', 'true');
    expect(await paint(male)).not.toBe(await paint(female));
  });

  test('refuses a duplicate nickname with the FDS message', async ({ page }) => {
    const nickname = unique('Bryan');

    for (const attempt of [1, 2]) {
      await page.goto('/signup');
      await typeInto(page.getByTestId('signup-form__nickname'), nickname.toUpperCase());
      await typeInto(page.getByTestId('signup-form__pin'), '1357');
      await page.getByTestId('signup-form__cluster').selectOption('CS');
      await page.getByTestId('signup-form__gender-male').click();
      await page.getByTestId('signup-form__avatar').first().click();
      await page.getByTestId('signup-form__submit').click();
      if (attempt === 1) await page.waitForURL('**/home');
    }

    // Case-insensitive uniqueness (fds.md §2.1) — the second attempt never leaves S1.
    await expect(page.getByTestId('signup-form__error')).toContainText(
      'Nickname must be 3–20 characters',
    );
    await expect(page).toHaveURL(/\/signup/);
  });
});
