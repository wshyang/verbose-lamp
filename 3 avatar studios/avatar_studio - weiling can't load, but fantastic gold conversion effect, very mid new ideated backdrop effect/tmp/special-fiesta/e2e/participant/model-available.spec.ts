import { expect, test, type Browser, type Page } from '@playwright/test';
import { parseAvatarSprite } from '@psd/contracts';
import { SIGNUP_BACKDROP } from '../support/fixtures.js';
import {
  CDN,
  FAKE_FACE_DETECTOR,
  HINTS,
  mediapipe,
  NO_FACE_DETECTOR,
  NO_WEBGPU,
  WEBGPU_WITHOUT_ADAPTER,
  WITH_WEBGPU,
  busyPhoto,
  modelCalls,
  openStudio,
  recordingTransformers,
  savedSprite,
  useSquare,
} from '../support/photo-stubs.js';

/**
 * ADR-044 — the cut-out model WORKING, which is the half of ADR-033 the suite could only
 * assume. `photo-sprites.spec.ts` already proves every way the model can be *absent* or
 * *misbehave*; what nothing proved is the contract with the library when it is genuinely
 * there: which task and model are asked for, which device ladder is walked, that a refused
 * fast device costs one retry rather than the photo, that the weights are fetched once per
 * session, and that the mask actually changes the sprite rather than being computed and
 * dropped. A green fallback path can hide a model that never ran.
 *
 * The stand-in used here records what it was asked (`recordingTransformers`), so these are
 * assertions about the app's own half of the contract — the real library's half is checked
 * by the last test in this file, gated on `PSD_E2E_REAL_MODEL=1` because it needs the
 * internet, and only then is it the genuine Transformers.js + MODNET weights.
 *
 * `navigator.gpu` is pinned in both directions: whether a host's browser ships WebGPU is a
 * fact about the host, and the ladder in `segmentPhoto.ts` is what every iPhone depends on.
 */

const TASK = 'background-removal';
const MODEL = 'Xenova/modnet';

const hint = (page: Page) => page.getByTestId('avatar-studio__photo-state');

async function serveModel(page: Page, refuse?: 'webgpu' | 'wasm') {
  await page.route(CDN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: recordingTransformers(refuse) }),
  );
}

/** ADR-059 — a worn photo hides the picker, so swapping one means taking the old one off first. */
async function convert(page: Page, photo: string) {
  const picker = page.getByTestId('avatar-studio__photo');
  if ((await picker.count()) === 0) {
    // ADR-227 — removal needs no character first; the removal is pending until the save.
    await page.getByTestId('avatar-studio__photo-clear').click();
    await expect(picker).toBeVisible();
  }
  await picker.setInputFiles(photo);
}

function read(sprite: string) {
  const parsed = parseAvatarSprite(sprite);
  if (parsed === null) throw new Error(`unreadable sprite: ${sprite.slice(0, 32)}…`);
  return {
    size: parsed.size,
    at: (x: number, y: number) => parsed.palette[parsed.rows[y]?.charAt(x) ?? ''] ?? '',
  };
}

/** Corners are background under the stand-in's ellipse mask, so they are its cut-out's proof. */
function cornersOf(sprite: string): string[] {
  const { size, at } = read(sprite);
  const last = size - 1;
  return [at(0, 0), at(last, 0), at(0, last), at(last, last)];
}

/**
 * How much of the sprite's outer ring is the participant's backdrop. A real matte on a real
 * photograph can reach a corner — an elbow, hair, a shoulder in a tight crop — so "the
 * background was removed" is a claim about the border as a whole, not about four pixels.
 */
function borderBackdropShare(sprite: string): number {
  const { size, at } = read(sprite);
  const last = size - 1;
  const ring: string[] = [];
  for (let along = 0; along < size; along += 1) {
    ring.push(at(along, 0), at(along, last), at(0, along), at(last, along));
  }
  return ring.filter((colour) => colour === SIGNUP_BACKDROP).length / ring.length;
}

/** The saved sprite for one photo, in its own context, with or without the model on the CDN. */
async function spriteFor(browser: Browser, input: { photo: string; model: boolean }): Promise<string> {
  const context = await browser.newContext();
  try {
    await context.route(CDN, (route) =>
      input.model
        ? route.fulfill({ contentType: 'text/javascript', body: recordingTransformers() })
        : route.abort(),
    );
    // A detector box on both sides, so the crop is identical and only the mask differs.
    await context.addInitScript(FAKE_FACE_DETECTOR);
    const page = await context.newPage();
    await openStudio(page, input.model ? 'WithModel' : 'NoModel');
    await convert(page, input.photo);
    await expect(hint(page)).toHaveText(input.model ? HINTS.refined : HINTS.plain, {
      timeout: 30_000,
    });
    await useSquare(page);
    return await savedSprite(page);
  } finally {
    await context.close();
  }
}

test.describe('the cut-out model, available and working', () => {
  // The device ladder is the same code on a phone and a laptop; one project shape per engine.
  test.skip(({ isMobile }) => isMobile === true, 'the model ladder runs once per engine, on desktop');

  test('asks for MODNET background-removal on WASM when the browser has no WebGPU', async ({
    page,
  }) => {
    await serveModel(page);
    await page.addInitScript(NO_WEBGPU);
    await page.addInitScript(NO_FACE_DETECTOR);
    // ADR-054 — a mask cannot locate a face, so the locator supplies the crop here.
    await mediapipe(page, 'found');
    await openStudio(page, 'Wasm');

    await convert(page, busyPhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });

    expect(await modelCalls(page)).toEqual([`${TASK}|${MODEL}|wasm`]);
  });

  test('stays on WASM where the browser offers a working WebGPU (ADR-221)', async ({ page }) => {
    // The same frame gave a mean face alpha of 232/255 on WASM and 157/255 on WebGPU, with holes
    // through the forehead and cheeks, so WebGPU is never asked for even when it would work.
    await serveModel(page);
    await page.addInitScript(WITH_WEBGPU);
    await page.addInitScript(NO_FACE_DETECTOR);
    // ADR-054 — a mask cannot locate a face, so the locator supplies the crop here.
    await mediapipe(page, 'found');
    await openStudio(page, 'Gpu');

    await convert(page, busyPhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });

    expect(await modelCalls(page)).toEqual([`${TASK}|${MODEL}|wasm`]);
  });

  test('a WebGPU that yields no adapter changes nothing: still one WASM call', async ({ page }) => {
    await serveModel(page);
    await page.addInitScript(WEBGPU_WITHOUT_ADAPTER);
    await page.addInitScript(NO_FACE_DETECTOR);
    // ADR-054 — a mask cannot locate a face, so the locator supplies the crop here.
    await mediapipe(page, 'found');
    await openStudio(page, 'NoAdapter');

    await convert(page, busyPhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });

    expect(await modelCalls(page)).toEqual([`${TASK}|${MODEL}|wasm`]);
  });

  test('a WebGPU backend that would be refused is never reached, so it costs nothing', async ({
    page,
  }) => {
    // This used to prove the WebGPU -> WASM retry (ADR-041). With WebGPU not asked for, the
    // refusal cannot happen: one call, on WASM, and the participant still gets the cut-out.
    await serveModel(page, 'webgpu');
    await page.addInitScript(WITH_WEBGPU);
    await page.addInitScript(NO_FACE_DETECTOR);
    // ADR-054 — a mask cannot locate a face, so the locator supplies the crop here.
    await mediapipe(page, 'found');
    await openStudio(page, 'GpuBad');

    await convert(page, busyPhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });

    expect(await modelCalls(page)).toEqual([`${TASK}|${MODEL}|wasm`]);
  });

  test('fetches the weights once and keeps them for the rest of the session', async ({ page }) => {
    await serveModel(page);
    await page.addInitScript(NO_WEBGPU);
    await page.addInitScript(NO_FACE_DETECTOR);
    // ADR-054 — a mask cannot locate a face, so the locator supplies the crop here.
    await mediapipe(page, 'found');
    await openStudio(page, 'Once');

    for (const photo of [busyPhoto(), busyPhoto(1)]) {
      await convert(page, photo);
      await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 30_000 });
    }

    // Two photos, one pipeline: the second conversion reused the loaded segmenter.
    expect(await modelCalls(page)).toEqual([`${TASK}|${MODEL}|wasm`]);
  });

  test('the mask changes the sprite: the busy background becomes the backdrop', async ({
    browser,
  }) => {
    // One photo, one crop source (the detector's box), two networks. The only difference
    // between the two sprites is whether the model's mask was applied — so if they match,
    // the model ran and was thrown away.
    const photo = busyPhoto();
    const colourOnly = await spriteFor(browser, { photo, model: false });
    const modelCut = await spriteFor(browser, { photo, model: true });

    expect(modelCut).not.toEqual(colourOnly);
    for (const corner of cornersOf(modelCut)) expect(corner).toBe(SIGNUP_BACKDROP);
  });
});

test.describe('the real Transformers.js and the real MODNET weights', () => {
  test.skip(
    process.env['PSD_E2E_REAL_MODEL'] !== '1',
    'needs the internet: set PSD_E2E_REAL_MODEL=1 to fetch the genuine library and weights',
  );
  test.skip(({ isMobile }) => isMobile === true, 'the real model runs once per engine, on desktop');

  test('the genuine library cuts the background out on this engine', async ({ page }) => {
    // Nothing is routed: the CDN answers for real, ONNX Runtime picks a device for real, and
    // the weights download once. Minutes on a cold cache, hence the budget.
    test.setTimeout(420_000);
    // No detector, so the head box comes from the model's own mask — the iPhone ladder.
    await page.addInitScript(NO_FACE_DETECTOR);
    await openStudio(page, 'RealModel');

    await convert(page, busyPhoto());
    await expect(hint(page)).toHaveText(HINTS.refined, { timeout: 360_000 });
    await useSquare(page);

    const sprite = await savedSprite(page);
    expect(sprite).toMatch(/^128:/);
    // The real matte, not the stand-in's ellipse: judge the whole border, not four pixels.
    expect(borderBackdropShare(sprite)).toBeGreaterThan(0.6);
  });
});
