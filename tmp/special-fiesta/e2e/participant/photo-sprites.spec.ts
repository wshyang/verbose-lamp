import { expect, test, type Page } from '@playwright/test';
import {
  busyPhoto,
  CDN,
  corpus,
  FAKE_FACE_DETECTOR,
  FAKE_TRANSFORMERS,
  HINTS,
  mediapipe,
  NO_FACE_DETECTOR,
  openStudio,
  savedSprite,
  useSquare,
} from '../support/photo-stubs.js';

/**
 * ADR-031/033/034/036/037 — the photo studio, in a real Chromium, over the whole
 * social-media test corpus (`images/ingest/social*`), under every availability the
 * beach can throw at it:
 *
 *   1. the segmentation model CAN be fetched          → background removed by the model;
 *   2. the model cannot, but a FaceDetector exists    → face found, photo kept whole;
 *   3. nothing can find the face                      → the participant places the square;
 *   4. the awkward rest — a file that is not a photo, a model that loads and then lies,
 *      a detector that throws, taking the photo off again, and the sprite surviving a
 *      save and a reload.
 *
 * The model is a network guest (ADR-033), so the suite owns the network: the CDN route
 * is either answered with a tiny stand-in module that behaves like Transformers.js, or
 * refused outright. Nothing else is mocked — real app, real API, real database.
 *
 * The corpus is deliberately large, so it runs once per engine, on the desktop project; set
 * PSD_E2E_PHOTO_SAMPLE=n to convert only every n-th photo while iterating locally.
 */

// Eighty conversions per test is minutes of loop, not a stuck test — and hours of video.
test.use({ video: 'off' });

/**
 * ADR-059 — one avatar source at a time, so the picker is only on screen when nothing is worn.
 *
 * The corpus tests walk eighty photographs through a single studio, which means every iteration
 * after the first has to take the previous photo off: choose a character to fall back to, then
 * remove. That is the real flow a participant follows to swap a photo, so driving it eighty times
 * is coverage rather than ceremony.
 */
async function convert(page: Page, photo: string) {
  const picker = page.getByTestId('avatar-studio__photo');
  if ((await picker.count()) === 0) {
    // ADR-227 — removal needs no character first; the removal is pending until the save.
    await page.getByTestId('avatar-studio__photo-clear').click();
    await expect(picker).toBeVisible();
  }
  await picker.setInputFiles(photo);
}

const hint = (page: Page) => page.getByTestId('avatar-studio__photo-state');

test.describe('the photo studio, across the corpus', () => {
  // The corpus is the point, not the viewport: run it once, on the desktop project.
  test.skip(({ isMobile }) => isMobile === true, 'the corpus runs once per engine, on desktop');
  test.beforeEach(() => test.setTimeout(90_000 + corpus().length * 25_000));

  test('1 — the model is available: every photo gets its background cut out', async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
    );
    // ADR-054 — the Android Chrome shape, stated rather than inherited: a cut-out from the model
    // and a face box from the browser. Without pinning the detector this test's outcome depended
    // on whether the HOST's Chromium happens to ship the Shape Detection API.
    await page.addInitScript(FAKE_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    for (const photo of corpus()) {
      await convert(page, photo);
      await expect(hint(page), photo).toHaveText(HINTS.refined, { timeout: 30_000 });
      // ADR-056 — the square is shown already sitting on the face that was found, so the
      // participant confirms the framing instead of being handed it.
      await expect(page.getByTestId('photo-cropper'), photo).toBeVisible();
      await expect(page.getByTestId('photo-cropper'), photo).toContainText('face we found');
      await useSquare(page);
    }

    // What the server keeps is a 128×128 sprite named by its own hash (ADR-035/037).
    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);
  });

  test('1b — the iOS Safari shape: no browser detector, so the face locator earns its keep', async ({
    page,
  }) => {
    /*
     * WebKit has no Shape Detection API, so every iPhone walks exactly this ladder: no
     * FaceDetector, and the face has to be found by the downloaded detector instead.
     *
     * ADR-054 — this test used to assert that the mask did the head-finding too, and passed over
     * all eighty photos while the seeded crowd wore a plate of chicken rice and somebody's hand.
     * It was asserting the defect. A silhouette cannot locate a face; a face detector can.
     */
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
    );
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'found');
    await openStudio(page, 'Foto');

    for (const photo of corpus()) {
      await convert(page, photo);
      await expect(hint(page), photo).toHaveText(HINTS.refined, { timeout: 30_000 });
      // The locator framed it, so the square opens on the face rather than in the middle.
      await expect(page.getByTestId('photo-cropper'), photo).toContainText('face we found');
      await useSquare(page);
    }

    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);
  });

  test('1c — a cut-out but no face anywhere: the square is asked for, not guessed at', async ({
    page,
  }) => {
    /*
     * ADR-053/054 — the regression guard at the level the defect actually reached the user. The
     * model succeeds, so the background really is removed; nothing locates a face. The old code
     * treated the successful mask as licence to present its guess as finished. The photo is still
     * shown and nothing is lost — the participant is simply asked where the face is.
     */
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
    );
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'blind');
    await openStudio(page, 'Foto');

    await convert(page, busyPhoto(0));
    await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
    await expect(page.getByTestId('photo-cropper')).toBeVisible();
  });

  test('2 — no model, but a FaceDetector: the face is framed and the photo kept', async ({ page }) => {
    await page.route(CDN, (route) => route.abort());
    await page.addInitScript(FAKE_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    for (const photo of corpus()) {
      await convert(page, photo);
      await expect(hint(page), photo).toHaveText(HINTS.plain, { timeout: 30_000 });
      // ADR-056 — the browser's detector found the face, so the square opens on it for confirming.
      await expect(page.getByTestId('photo-cropper'), photo).toContainText('face we found');
      await useSquare(page);
    }

    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);
  });

  test('3 — nothing can find the face: the participant places the square', async ({ page }) => {
    await page.route(CDN, (route) => route.abort());
    // "Nothing" is a claim about the browser, so make the browser match it: a host whose
    // Chromium ships a real FaceDetector must not quietly turn this into situation 2.
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    for (const photo of corpus()) {
      await convert(page, photo);
      await expect(hint(page), photo).toHaveText(HINTS.cropping, { timeout: 30_000 });

      // Drag the square somewhere deliberate, grow it a little, and use it (ADR-036).
      const box = page.getByTestId('photo-cropper__box');
      await box.hover();
      await page.mouse.down();
      await page.mouse.move(0, 0);
      await page.mouse.up();
      const handle = page.getByTestId('photo-cropper__handle');
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move(40, 40);
      await page.mouse.up();
      await page.getByTestId('photo-cropper__use').click();
      // ADR-229 — Done commits the square and closes the dialog.
      await expect(page.getByTestId('photo-dialog'), photo).toBeHidden();
      await expect(page.getByTestId('photo-cropper'), photo).toBeHidden();
    }

    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);
  });
});

test.describe('the awkward rest', () => {
  test.skip(({ isMobile }) => isMobile === true, 'the corpus runs once per engine, on desktop');

  const onePhoto = (): string => {
    const [first] = corpus();
    if (first === undefined) throw new Error('corpus is empty — generate the test photos first');
    return first;
  };

  test('a file that is not a photo is refused with the message, not a crash', async ({ page }) => {
    await page.route(CDN, (route) => route.abort());
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    await page.getByTestId('avatar-studio__photo').setInputFiles({
      name: 'not-a-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('this is not a png'),
    });
    await expect(hint(page)).toHaveText(HINTS.failed);
    // And the studio recovers: the next photo converts as if nothing happened.
    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
  });

  test('a model that loads and then lies falls back to the square, never crashes', async ({ page }) => {
    // The CDN answers, the pipeline resolves — and the runner returns nothing usable.
    await page.route(CDN, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export class RawImage { constructor() {} }
               export async function pipeline() { return async () => []; }`,
      }),
    );
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
  });

  test('a model that throws mid-run falls back the same way', async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export class RawImage { constructor() {} }
               export async function pipeline() { return async () => { throw new Error('oom'); }; }`,
      }),
    );
    await page.addInitScript(NO_FACE_DETECTOR);
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
  });

  test('a FaceDetector that throws is the same as no FaceDetector', async ({ page }) => {
    await page.route(CDN, (route) => route.abort());
    await page.addInitScript(`
      window.FaceDetector = class {
        async detect() { throw new Error('no permission'); }
      };
    `);
    // ADR-056 — no face locator here either, stated so the real CDN is never reached.
    await mediapipe(page, 'offline');
    await openStudio(page, 'Foto');

    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
  });

  test('taking the photo off brings the drawn character straight back', async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
    );
    // ADR-056 — these two are about what happens AFTER a successful conversion, so the locator
    // finds the face. Stated rather than left to the host, which would reach the real CDN.
    await mediapipe(page, 'found');
    await openStudio(page, 'Foto');

    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });
    await useSquare(page);
    // ADR-034 — while a photo is worn, the trait studio stands down…
    await expect(page.getByTestId('avatar-studio__toggle')).toBeHidden();
    // ADR-227 — removal needs no character first.
    await page.getByTestId('avatar-studio__photo-clear').click();
    // …and taking it off brings character, hair and colours back.
    await expect(page.getByTestId('avatar-studio__toggle')).toBeVisible();
  });

  test('the saved sprite survives a reload, served by id from the sprite cache', async ({ page }) => {
    await page.route(CDN, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
    );
    // ADR-056 — these two are about what happens AFTER a successful conversion, so the locator
    // finds the face. Stated rather than left to the host, which would reach the real CDN.
    await mediapipe(page, 'found');
    await openStudio(page, 'Foto');

    await convert(page, onePhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });
    await useSquare(page);
    const sprite = await savedSprite(page);
    expect(sprite.startsWith('128:')).toBe(true);

    await page.reload();
    // The profile card draws the photo sprite again — id from the row, body from cache.
    const preview = page.getByTestId('profile__avatar').or(page.locator('.gb-avatar').first());
    await expect(preview.first()).toBeVisible();
    const me = await (await page.request.get('/api/me')).json();
    expect(me.participant.avatarPhotoId).toMatch(/^[0-9a-f]{16}$/);
  });
});
