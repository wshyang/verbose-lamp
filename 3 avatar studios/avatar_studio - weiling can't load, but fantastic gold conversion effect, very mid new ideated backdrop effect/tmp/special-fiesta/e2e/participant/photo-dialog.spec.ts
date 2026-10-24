import { expect, test } from '@playwright/test';
import { corpus, CDN } from '../support/photo-stubs.js';
import { participantWearingPhoto, photoSprite, servedFor } from '../support/photo-api.js';

/**
 * ADR-229 — the photo's own dialog, in a real Chromium, from the profile's look editor.
 *
 * A saved photo is replaced through the dialog: the new picture is converted inside it, not on the avatar.
 * Cancel keeps the photo the participant already had, and Done replaces it at the save. The cut-out model is
 * refused, as it is offline here, so the colour cut-out is what is being judged. Cut-out quality is not judged.
 */
test.describe('the photo dialog (ADR-229)', () => {
  test('Cancel keeps the saved photo; Done replaces it at the save', async ({ page }) => {
    await page.route(CDN, (route) => route.abort());
    const original = photoSprite();
    await participantWearingPhoto(page, original);
    await page.goto('/me');
    await page.getByTestId('profile__look-edit').click();

    // Replace opens the dialog, and the picture is converted inside it.
    await page.getByTestId('avatar-studio__photo-replace').click();
    await expect(page.getByTestId('photo-dialog')).toBeVisible();
    await page.getByTestId('avatar-studio__photo').setInputFiles(corpus()[0] as string);
    await expect(page.getByTestId('photo-cropper__use')).toBeVisible({ timeout: 60_000 });

    // Cancel: the dialog closes and the photo the participant had is still the photo.
    await page.getByTestId('photo-cropper__cancel').click();
    await expect(page.getByTestId('photo-dialog')).toBeHidden();
    await expect(page.getByTestId('avatar-studio__photo-clear')).toBeVisible();
    expect(await servedFor(page, original)).toEqual([original]);

    // Replace again, convert, Done: the dialog closes, and the save puts the new picture on the avatar.
    // A different picture: a file input does not report the same file twice, and this is the point.
    await page.getByTestId('avatar-studio__photo-replace').click();
    await page.getByTestId('avatar-studio__photo').setInputFiles(corpus()[1] as string);
    await expect(page.getByTestId('photo-cropper__use')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('photo-cropper__use').click();
    await expect(page.getByTestId('photo-dialog')).toBeHidden();
    await page.getByTestId('profile__look-save').click();
    await expect(page.getByTestId('profile__look-saved')).toBeVisible();

    // The old face is gone from the server (ADR-228): the replacement is what is served now.
    expect(await servedFor(page, original)).toEqual([]);
  });
});
