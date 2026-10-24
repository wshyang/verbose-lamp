import { randomBytes, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import {
  AVATAR_SPRITE_SIZE,
  avatarSpriteId,
  formatAvatarLook,
  formatAvatarSprite,
  readAvatarLook,
} from '@psd/contracts';
import { apiSignUp, SIGNUP_LOOK } from './fixtures.js';

/**
 * ADR-227 / ADR-228 / ADR-229 — the saved-photo helpers the photo specs share. The participant is created and
 * saved through the API on the browser context's own request object, so the session cookie lands in the page and
 * no sign-in form is used. Nothing here runs a model: a photo is a plain sprite.
 */

/*
 * A backdrop no character wears. Choosing the next character then leaves the backdrop alone, so the photo
 * restored by "My photo" is the same sprite, and the "kept" test below checks the same face. A photo restored
 * into a different backdrop is a different sprite, and that case is covered by the studio's unit tests.
 */
export const KEPT_BACKDROP = '#f0e6c8';
export const LOOK = formatAvatarLook({ ...readAvatarLook(SIGNUP_LOOK), backdrop: KEPT_BACKDROP });

/**
 * A sprite the database accepts: three photo colours, then the backdrop, then the ink. The backdrop is the
 * look's own, as a photo taken under that look would carry it.
 */
export function photoSprite(): string {
  // A random first colour, so no two tests share a face: the server serves a face while any row still holds it.
  const rows = Array.from({ length: AVATAR_SPRITE_SIZE }, (_row, y) =>
    (y < AVATAR_SPRITE_SIZE / 2 ? '0' : '3').repeat(AVATAR_SPRITE_SIZE),
  );
  const backdrop = readAvatarLook(LOOK).backdrop.slice(1);
  return formatAvatarSprite({
    size: AVATAR_SPRITE_SIZE,
    palette: [randomBytes(3).toString('hex'), '445566', '778899', backdrop, '000000'],
    rows,
  });
}

/** Sign up through the API, then save the photo, so the profile opens already wearing it. */
export async function participantWearingPhoto(page: Page, sprite: string) {
  // A fresh nickname per test: the database outlives a run, and a taken nickname is a 409.
  const nickname = `Rm${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const who = await apiSignUp(page.context().request, { nickname });
  const saved = await page.context().request.put('/api/me/avatar', {
    data: { avatarVariant: 1, avatarLook: LOOK, avatarPhoto: sprite },
  });
  expect(saved.ok(), `saving the photo: ${saved.status()}`).toBe(true);
  return who;
}

/** The face ids this browser keeps in its own sprite cache (ADR-035), read as the page sees them. */
export async function phoneHolds(page: Page, sprite: string): Promise<boolean> {
  const cached = await page.evaluate(() => window.localStorage.getItem('psd.sprites.v1'));
  return (cached ?? '').includes(avatarSpriteId(sprite));
}

/** What the server would still serve for this photo: the body, or nothing once it is gone. */
export async function servedFor(page: Page, sprite: string): Promise<string[]> {
  const response = await page.context().request.get('/api/avatars', {
    params: { ids: avatarSpriteId(sprite) },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { items: Array<{ sprite: string }> };
  return body.items.map((item) => item.sprite);
}
