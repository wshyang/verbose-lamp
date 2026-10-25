import { expect, test, type Page } from '@playwright/test';
import {
  CAMERA_REFUSED,
  CDN,
  FAKE_FACE_DETECTOR,
  FAKE_TRANSFORMERS,
  HINTS,
  NO_CAMERA,
  NO_FACE_DETECTOR,
  mediapipe,
  openStudio,
  savedSprite,
  useSquare,
} from '../support/photo-stubs.js';

/**
 * ADR-042/043 — "take a selfie now", in a real browser with a real (mock-device) camera.
 * Chromium takes `--use-fake-device-for-media-stream` from the config; Playwright's WebKit
 * boots with its own mock capture devices. Either engine streams a genuine test pattern
 * through the genuine viewfinder, so this file runs unchanged on all four projects.
 *
 * The matrix is the photo studio's, because a captured frame walks the SAME ladder an
 * uploaded photo walks (ADR-031/033/034):
 *
 *   1. detector + cut-out model  → the boundary follows the face, background removed;
 *   2. no detector + model       → the oval guide stands in (every iPhone, ADR-041);
 *   3. detector, no model        → colour cut-out, and the copy says the model was absent;
 *   4. neither                   → the participant places the square themselves;
 *   5. no camera / a refused one → the copy says so and the photo picker stays in reach.
 *
 * Cases 3–5 are the beach without data, which is the likeliest beach there is.
 */

test.use({ permissions: ['camera'] });

async function openSelfie(page: Page, label: string) {
  await openStudio(page, label);
  await page.getByTestId('avatar-studio__selfie-open').click();
  await expect(page.getByTestId('avatar-studio__selfie')).toBeVisible();
}

/** Capture needs a first frame; wait for the mock camera to actually deliver one. */
async function awaitFirstFrame(page: Page) {
  await page
    .getByTestId('avatar-studio__selfie-video')
    .evaluate((video: HTMLVideoElement) =>
      video.readyState === video.HAVE_ENOUGH_DATA
        ? undefined
        : new Promise<void>((resolve) => video.addEventListener('canplaythrough', () => resolve())),
    );
}

async function openViewfinder(page: Page, label = 'Cam') {
  await openSelfie(page, label);
  await awaitFirstFrame(page);
}

const hint = (page: Page) => page.getByTestId('avatar-studio__photo-state');

/** The cut-out model, answered from the suite's own network (ADR-033 — it is a CDN guest). */
async function modelAvailable(page: Page) {
  await page.route(CDN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: FAKE_TRANSFORMERS }),
  );
}

/** The same CDN, refused: the beach with no data, or a CDN the venue's Wi-Fi blocks. */
async function modelUnavailable(page: Page) {
  await page.route(CDN, (route) => route.abort());
}

test('with a FaceDetector, the live boundary follows the face and the capture converts', async ({
  page,
}) => {
  await modelAvailable(page);
  await page.addInitScript(FAKE_FACE_DETECTOR);
  await mediapipe(page, 'offline');
  await openViewfinder(page);

  // The Android shape: the boundary is live on the preview, no oval guide.
  await expect(page.getByTestId('avatar-studio__selfie-face')).toBeVisible();
  await expect(page.getByTestId('avatar-studio__selfie-guide')).toBeHidden();

  await page.getByTestId('avatar-studio__selfie-capture').click();
  // The viewfinder closes and the frame walks the ladder to the model's cut-out.
  await expect(page.getByTestId('avatar-studio__selfie')).toBeHidden();
  await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });

  // ADR-229 — Use this square commits the photo; then the usual hash-named 128×128 sprite is what the server keeps.
  await useSquare(page);
  expect(await savedSprite(page)).toMatch(/^128:/);
});

test('without a FaceDetector — iOS Safari — the oval guide stands in and capture still converts', async ({
  page,
}) => {
  await modelAvailable(page);
  await page.addInitScript(NO_FACE_DETECTOR);
  await mediapipe(page, 'found');
  await openViewfinder(page);

  await expect(page.getByTestId('avatar-studio__selfie-guide')).toBeVisible();
  await expect(page.getByTestId('avatar-studio__selfie-face')).toBeHidden();

  await page.getByTestId('avatar-studio__selfie-capture').click();
  await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });
});

test('never mind backs out without touching the drawn character', async ({ page }) => {
  await modelUnavailable(page);
  await page.addInitScript(NO_FACE_DETECTOR);
  await mediapipe(page, 'offline');
  await openViewfinder(page);

  await page.getByTestId('avatar-studio__selfie-cancel').click();
  await expect(page.getByTestId('avatar-studio__selfie')).toBeHidden();
  // No photo was taken: the studio still offers the trait editor, not a photo.
  await expect(page.getByTestId('avatar-studio__toggle')).toBeVisible();
});

test('no cut-out model, but a detector: the selfie is still cut out, by colour', async ({
  page,
}) => {
  // ADR-033 — the model is an upgrade, never a requirement. The detector found the head, so the
  // crop is a real answer rather than a guess; ADR-056 then shows it for confirmation.
  await modelUnavailable(page);
  await page.addInitScript(FAKE_FACE_DETECTOR);
  await mediapipe(page, 'offline');
  await openViewfinder(page);

  await page.getByTestId('avatar-studio__selfie-capture').click();
  await expect(hint(page)).toHaveText(HINTS.plain, { timeout: 30_000 });
  // ADR-056 — the square opens on the face the detector found. There is no longer a separate
  // "choose the square myself" button to assert on: the square itself is already on screen, which
  // is the whole point — overruling the crop is a drag rather than a request.
  await expect(page.getByTestId('photo-cropper')).toContainText('face we found');
  await expect(page.getByTestId('photo-cropper__box')).toBeVisible();

  await useSquare(page);
  expect(await savedSprite(page)).toMatch(/^128:/);
});

test('no cut-out model and no detector — an iPhone with no data — the square is the participant’s', async ({
  page,
}) => {
  // The worst available beach: iOS ships no FaceDetector (ADR-041) and the CDN is out of
  // reach, so nothing can find the face. ADR-036 says ask rather than guess.
  await modelUnavailable(page);
  await page.addInitScript(NO_FACE_DETECTOR);
  await mediapipe(page, 'offline');
  await openViewfinder(page);

  await page.getByTestId('avatar-studio__selfie-capture').click();
  await expect(hint(page)).toHaveText(HINTS.cropping, { timeout: 30_000 });
  await expect(page.getByTestId('photo-cropper')).toBeVisible();

  const box = page.getByTestId('photo-cropper__box');
  await box.hover();
  await page.mouse.down();
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.getByTestId('photo-cropper__use').click();

  // ADR-229 — Done commits the square and closes the dialog.
  await expect(page.getByTestId('photo-dialog')).toBeHidden();
  await expect(page.getByTestId('photo-cropper')).toBeHidden();
  expect(await savedSprite(page)).toMatch(/^128:/);
});

test('a refused camera says so, and the photo picker is still there', async ({ page }) => {
  // Chromium's fake-UI flag grants the prompt unconditionally, so the refusal has to come
  // from getUserMedia itself — which is where a real "Don't Allow" lands anyway.
  await modelUnavailable(page);
  await page.addInitScript(CAMERA_REFUSED);
  await openSelfie(page, 'NoPerm');

  await expect(page.getByTestId('avatar-studio__selfie-error')).toHaveText(
    'Camera permission denied — choose a photo instead.',
  );
  // "Never mind" is reachable, taking a photo is not, and the alternative is one tap away.
  await expect(page.getByTestId('avatar-studio__selfie-capture')).toBeDisabled();
  await expect(page.getByTestId('avatar-studio__photo-label')).toBeVisible();

  await page.getByTestId('avatar-studio__selfie-cancel').click();
  await expect(page.getByTestId('avatar-studio__toggle')).toBeVisible();
});

test('a device with no camera at all says that instead', async ({ page }) => {
  await modelUnavailable(page);
  await page.addInitScript(NO_CAMERA);
  await openSelfie(page, 'NoCam');

  await expect(page.getByTestId('avatar-studio__selfie-error')).toHaveText(
    'No camera on this device — choose a photo instead.',
  );
  await expect(page.getByTestId('avatar-studio__selfie-capture')).toBeDisabled();
});
