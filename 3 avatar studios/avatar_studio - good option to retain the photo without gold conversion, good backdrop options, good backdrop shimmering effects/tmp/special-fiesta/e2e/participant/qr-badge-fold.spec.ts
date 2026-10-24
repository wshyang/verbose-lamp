import { expect, test } from '@playwright/test';
import { apiSignUp, signInParticipant, unique } from '../support/fixtures.js';

/**
 * ADR-266 / ADR-318 — the spoken number on the My QR tab is above the fold on every phone.
 *
 * The code is sized by width, so on a short phone the card is taller than the space between the
 * banner and the nav and the 4-digit number is the first thing to fall off the bottom. Only a
 * browser knows where that line is, so this reads layout boxes, not attributes.
 */

const SCREENS = [
  { label: 'Pixel 7', width: 412, height: 839 },
  { label: 'iPhone 15', width: 393, height: 659 },
  { label: 'Galaxy S9+', width: 320, height: 658 },
  { label: 'iPhone SE', width: 320, height: 568 },
];

/** The smallest the code may get before it stops being scannable (ADR-318). */
const QR_FLOOR_PX = 120;

for (const [index, screen] of SCREENS.entries()) {
  test(`shows nickname, code and number without scrolling on ${screen.label}`, async ({ page, request }) => {
    const nickname = unique(`qrfold${index}`);
    await apiSignUp(request, { nickname });
    await page.setViewportSize({ width: screen.width, height: screen.height });
    await signInParticipant(page, nickname);
    await page.goto('/home');

    const number = page.getByTestId('qr-home__scan-number');
    await expect(number).toBeVisible();
    await expect(page.locator('img.gb-qr')).toBeVisible();

    const main = await page.locator('.gb-main').boundingBox();
    const pill = await number.boundingBox();
    const code = await page.locator('img.gb-qr').boundingBox();
    const hint = await page.getByTestId('qr-home__fallback').boundingBox();
    if (!main || !pill || !code || !hint) throw new Error('layout boxes missing');

    expect(hint.y, `${screen.label}: the number's line sits below the code, not over it`).toBeGreaterThanOrEqual(
      code.y + code.height - 0.5,
    );

    expect(pill.y + pill.height, `${screen.label}: number is inside the visible area`).toBeLessThanOrEqual(
      main.y + main.height + 0.5,
    );
    expect(pill.y, `${screen.label}: number starts below the top`).toBeGreaterThanOrEqual(main.y);
    expect(Math.abs(code.width - code.height), `${screen.label}: the code stays square`).toBeLessThanOrEqual(1);
    expect(code.width, `${screen.label}: the code stays scannable`).toBeGreaterThanOrEqual(QR_FLOOR_PX);
  });
}

test('keeps the code at its full width where the screen is tall enough', async ({ page, request }) => {
  const nickname = unique('qrtall');
  await apiSignUp(request, { nickname });
  await page.setViewportSize({ width: 412, height: 839 });
  await signInParticipant(page, nickname);
  await page.goto('/home');

  const code = await page.locator('img.gb-qr').boundingBox();
  if (!code) throw new Error('no code box');
  // min(320px, 76vw) at 412px wide is 313px (ADR-266); the height fit must not touch it.
  expect(code.width).toBeCloseTo(313, 0);
});

test('lets the points and the profile link fall below the fold on a short phone', async ({ page, request }) => {
  const nickname = unique('qrscroll');
  await apiSignUp(request, { nickname });
  await page.setViewportSize({ width: 320, height: 568 });
  await signInParticipant(page, nickname);
  await page.goto('/home');

  const main = await page.locator('.gb-main').boundingBox();
  const link = await page.getByTestId('qr-home__profile').boundingBox();
  if (!main || !link) throw new Error('layout boxes missing');
  expect(link.y).toBeGreaterThanOrEqual(main.y + main.height);
});
