import { expect, test } from '@playwright/test';
import { participantWearingPhoto, phoneHolds, photoSprite, servedFor } from '../support/photo-api.js';

/**
 * ADR-227 / ADR-228 — removing a saved photo, in a real Chromium, through the profile's look editor.
 *
 * The participant is created and signed in through the API, on the browser context's own request
 * object, so the session cookie lands in the page. The sign-in form, which the shared helper drives and
 * which is unstable in some sandboxes, is not involved. The photo is a plain sprite sent to the API:
 * nothing runs a model here, so these tests are about the removal rules, not the cut-out.
 */

test.describe('removing a saved photo (ADR-227, ADR-228)', () => {
  test('needs no character first, and the photo stays on the row until the save', async ({ page }) => {
    const sprite = photoSprite();
    await participantWearingPhoto(page, sprite);
    await page.goto('/me');
    await page.getByTestId('profile__look-edit').click();
    // The phone has the face from the editor's own request, so the removal below has something to forget.
    await expect.poll(() => phoneHolds(page, sprite)).toBe(true);

    // No character has been picked, and removal is not blocked for it.
    await expect(page.getByTestId('avatar-studio__photo-clear')).toBeEnabled();
    await page.getByTestId('avatar-studio__photo-clear').click();

    // Pending: the photo is still on the row, unselected, and the preview is a character.
    await expect(page.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('avatar-studio__photo-state')).toContainText('removed when you save');
    await expect(page.getByTestId('avatar-studio__preview')).not.toHaveAttribute('alt', 'Photo portrait');
    // The server still holds it: nothing has been removed before the save.
    expect(await servedFor(page, sprite)).toEqual([sprite]);

    await page.getByTestId('profile__look-save').click();
    await expect(page.getByTestId('profile__look-saved')).toBeVisible();

    // Saved: the server has let the face go, and so has this phone (ADR-228).
    expect(await servedFor(page, sprite)).toEqual([]);
    expect(await phoneHolds(page, sprite)).toBe(false);

    // The page no longer wears the photo, after a reload too.
    await page.reload();
    await page.getByTestId('profile__look-edit').click();
    await expect(page.getByTestId('avatar-studio__photo-option')).toHaveCount(0);
  });

  test('"My photo" keeps the photo, and the save keeps it too', async ({ page }) => {
    const sprite = photoSprite();
    await participantWearingPhoto(page, sprite);
    await page.goto('/me');
    await page.getByTestId('profile__look-edit').click();

    await page.getByTestId('avatar-studio__photo-clear').click();
    await page.getByTestId('avatar-studio__photo-option').click();

    await expect(page.getByTestId('avatar-studio__photo-option')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('avatar-studio__preview')).toHaveAttribute('alt', 'Photo portrait');
    await page.getByTestId('profile__look-save').click();
    await expect(page.getByTestId('profile__look-saved')).toBeVisible();

    // Kept means kept: the server and this phone still have the face.
    expect(await servedFor(page, sprite)).toEqual([sprite]);
    expect(await phoneHolds(page, sprite)).toBe(true);
  });
});
