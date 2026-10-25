import { AVATAR_BACKDROP_SWATCHES } from '@psd/contracts';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { apiSignIn, apiSignUp, unique } from '../support/fixtures.js';
import {
  busyPhoto,
  CDN,
  FAKE_FACE_DETECTOR,
  FAKE_TRANSFORMERS,
  HINTS,
  mediapipe,
  useSquare,
} from '../support/photo-stubs.js';

/**
 * ADR-224, ADR-225 and ADR-234 — the square's picture shows the backdrop behind the person, and the small
 * picture beside the cut-out choices wears the pattern too.
 *
 * ADR-234: while the square is open the photo dialog covers the studio, so the backdrop and the pattern are
 * picked in the studio first, then the photo is chosen. After Use this square, a new backdrop or pattern shows
 * on the worn photo, and the next test below picks it before the next photo.
 *
 * These tests read the pixels a participant actually sees, in a real browser, so they check the picture rather
 * than the markup that holds it.
 *
 * Signed in through the API rather than the sign-in form: the form is not what is under test here. The studio
 * is then opened exactly as a participant opens it.
 */

test.use({ video: 'off' });

/**
 * The stand-in matte is an ellipse with a rectangle for shoulders, so the corners are always background:
 * they must show the backdrop itself.
 */
const GOLD = AVATAR_BACKDROP_SWATCHES[3].hex;
const TOLERANCE = 2;

function rgbOf(hex: string): number[] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
}

const GOLD_RGB = rgbOf(GOLD);

/** ADR-225 — the four pattern squares, by the kind each one picks. */
const PATTERN_KINDS = ['spiral', 'concentric', 'waves', 'psychedelic'] as const;

async function openStudioAsParticipant(page: Page): Promise<void> {
  const nickname = unique(`Preview${Math.random().toString(36).slice(2, 5)}`);
  await apiSignUp(page.request, { nickname });
  await apiSignIn(page.request, '/api/auth/participants/signin', { nickname, pin: '1234' });
  await page.goto('/me');
  await page.getByTestId('profile__look-edit').click();
  await expect(page.getByTestId('avatar-studio__photo-state')).toBeVisible();
}

/**
 * The trait rows are folded away until they are opened (ADR-027), and the backdrop row is one of them, so
 * the backdrop is picked before the photo only once the details are open.
 */
async function openDetails(page: Page): Promise<void> {
  const toggle = page.getByTestId('avatar-studio__toggle');
  if ((await toggle.count()) > 0 && (await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
}

/** Chooses a corpus photo through the studio's own input, and waits until the square can be committed. */
async function choosePhoto(page: Page, index = 0): Promise<void> {
  await page.getByTestId('avatar-studio__photo').setInputFiles(busyPhoto(index));
  await expect(page.getByTestId('avatar-studio__photo-state')).toHaveText(HINTS.refined, {
    timeout: 60_000,
  });
}

/** The top-left pixel of the picture the square is showing, read back from the image itself. */
async function cornerRgb(page: Page): Promise<number[] | null> {
  const overlay = page.getByTestId('photo-cropper__backdrop');
  if ((await overlay.count()) === 0) return null;
  const src = await overlay.getAttribute('src');
  if (src === null) return null;
  try {
    return await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (context === null) return null;
      context.drawImage(image, 0, 0);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0];
    }, src);
  } catch {
    // The picture was replaced between reading its address and loading it: the poll asks again.
    return null;
  }
}

/** The address of a picture, or null while it is not on the page. Each one is a data URL. */
async function srcOf(element: Locator): Promise<string | null> {
  return (await element.count()) === 0 ? null : element.getAttribute('src');
}

/** Waits for a picture to be on the page, then returns its address. */
async function pictureSrc(element: Locator): Promise<string> {
  await expect(element).toHaveAttribute('src', /./, { timeout: 15_000 });
  return String(await element.getAttribute('src'));
}

function closeTo(actual: number[] | null, expected: number[]): boolean {
  return actual !== null && actual.every((value, at) => Math.abs(value - (expected[at] ?? 0)) <= TOLERANCE);
}

test.describe('the cropper shows the backdrop behind the person (ADR-224, ADR-234)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({ body: FAKE_TRANSFORMERS, contentType: 'text/javascript' }),
    );
    await page.addInitScript(FAKE_FACE_DETECTOR);
    await mediapipe(page, 'found');
  });

  test('a backdrop picked in the studio is painted into the square', async ({ page }) => {
    await openStudioAsParticipant(page);
    await openDetails(page);
    await page.getByTestId('avatar-studio__backdrop').nth(3).click();

    await choosePhoto(page);
    await expect(page.getByTestId('photo-cropper__backdrop')).toBeVisible();
    await expect
      .poll(async () => closeTo(await cornerRgb(page), GOLD_RGB), { timeout: 15_000 })
      .toBe(true);
  });

  test('Leave it in shows the photograph as it was taken, and Take it out brings the backdrop back', async ({
    page,
  }) => {
    await openStudioAsParticipant(page);
    await openDetails(page);
    await page.getByTestId('avatar-studio__backdrop').nth(3).click();
    await choosePhoto(page);
    await expect
      .poll(async () => closeTo(await cornerRgb(page), GOLD_RGB), { timeout: 15_000 })
      .toBe(true);

    // "Leave it in" is the second of the two background choices; there is nothing to paint without a cut-out.
    await page.getByTestId('cut-out-controls__background').nth(1).click();
    await expect(page.getByTestId('photo-cropper__backdrop')).toHaveCount(0);

    await page.getByTestId('cut-out-controls__background').nth(0).click();
    await expect
      .poll(async () => closeTo(await cornerRgb(page), GOLD_RGB), { timeout: 15_000 })
      .toBe(true);
  });

  test('the sign-up screen, where a new character is made, shows the same picture', async ({ page }) => {
    await page.goto('/signup');
    // ADR-231 — no studio, and so no photo input, until a gender is chosen.
    await page.getByTestId('signup-form__gender-female').click();
    await openDetails(page);
    await page.getByTestId('avatar-studio__backdrop').nth(3).click();
    await choosePhoto(page);

    await expect
      .poll(async () => closeTo(await cornerRgb(page), GOLD_RGB), { timeout: 15_000 })
      .toBe(true);
  });

  /*
   * ADR-225 — the small picture beside "Tap a choice to see it change." wears the pattern, and it must be the
   * picture that gets saved. ADR-234 — each look is picked in the studio before its photo, because the dialog
   * covers the studio while the square is open. The three pictures exist together only once the square is
   * committed, so they are compared after Use this square, for each look in turn.
   */
  test('the small picture wears each pattern, and the saved pictures match it after Use this square', async ({
    page,
  }) => {
    await openStudioAsParticipant(page);
    await openDetails(page);

    const looks = ['plain', ...PATTERN_KINDS] as const;
    const squares: string[] = [];
    for (const [index, look] of looks.entries()) {
      if (look !== 'plain') await page.getByTestId(`avatar-studio__backdrop-${look}`).click();

      // A new photo for each look: the same file picked twice does not fire the input's change event.
      await choosePhoto(page, index);
      const square = await pictureSrc(page.getByTestId('cut-out-controls__preview'));
      squares.push(square);

      await useSquare(page);
      await expect
        .poll(() => srcOf(page.getByTestId('avatar-studio__photo-option').locator('img')), {
          timeout: 15_000,
        })
        .toBe(square);
      await expect
        .poll(() => srcOf(page.getByTestId('avatar-studio__preview')), { timeout: 15_000 })
        .toBe(square);
    }

    // Each pattern paints a picture of its own, and none of them is the plain one.
    expect(new Set(squares).size).toBe(looks.length);
  });
});
