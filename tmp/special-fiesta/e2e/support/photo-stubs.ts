import { readdirSync } from 'node:fs';
import { fromRepo } from './paths.js';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { apiSignUp, signInParticipant, unique } from './fixtures.js';

/**
 * ADR-033/039/040 — the network the photo studio depends on, owned by the suites.
 *
 * Two suites drive real photos through the studio: `photo-sprites.spec.ts` (every
 * availability, sampled personas) and `demo-onboarding.spec.ts` (the happy path,
 * every persona, recorded into the demo seed). Both need the same stand-ins: the
 * CDN pattern the model is fetched from, a Transformers.js that behaves, and a
 * FaceDetector the way Chrome on Android ships one.
 */

export const CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers*';

export const HINTS = {
  refined: 'Background removed. Move the square if the framing is off.',
  plain: 'Background removed as best we could — a plain wall works better.',
  cropping: 'We could not find your face. Put the square over it.',
  failed: 'That photo could not be read. Try another one.',
  /** ADR-060 — a photo already worn when the studio opens, rather than one just converted. */
  worn: 'Your photo is on. Remove my photo takes it off when you save.',
};

/**
 * The runner half of the stand-in: one mask per image, an ellipse of subject over
 * background — a portrait, as far as the sprite pipeline can tell. Shared by both
 * stand-in modules below so there is one stand-in mask in this suite, not two.
 */
const MASK_RUNNER = `
    return async (image) => {
      const { width, height } = image;
      const data = new Uint8Array(width * height);
      const cx = width / 2, cy = height * 0.45, rx = width * 0.28, ry = height * 0.38;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const head = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
          const shoulders = y > height * 0.78 && Math.abs(x - cx) < width * 0.42;
          if (head || shoulders) data[y * width + x] = 255;
        }
      }
      return [{ mask: { data, width, height } }];
    };
`;

const RAW_IMAGE = `
  export class RawImage {
    constructor(data, width, height, channels) {
      this.data = data; this.width = width; this.height = height; this.channels = channels;
    }
  }
`;

/**
 * A stand-in for Transformers.js, the shape `segmentPhoto.ts` consumes: `pipeline()`
 * hands back a runner, the runner hands back one mask.
 */
export const FAKE_TRANSFORMERS = `
  ${RAW_IMAGE}
  export async function pipeline() {
  ${MASK_RUNNER}
  }
`;

/** A FaceDetector the way Chrome on Android ships one: one face, one box. */
export const FAKE_FACE_DETECTOR = `
  window.FaceDetector = class {
    async detect() {
      return [{ boundingBox: { x: 220, y: 130, width: 200, height: 240 } }];
    }
  };
`;

/**
 * ADR-054 — the MediaPipe face locator's CDN, which every photo test must take a position on.
 *
 * Leaving it unrouted is the same mistake `NO_FACE_DETECTOR` exists to prevent, one layer out: on
 * a host with internet the app would really fetch 2.7 MB, really find a face, and a test that means
 * "nothing can find the face" would quietly become a test of something else. So availability is
 * always stated, never inherited from the host.
 */
export const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision*';

/**
 * A stand-in for `@mediapipe/tasks-vision`: the module shape `locateFace.ts` asks for, answering
 * with one face and the two eye keypoints the framing is built from.
 *
 * Like `FAKE_FACE_DETECTOR` this returns the SAME face for every photograph, so it proves the
 * wiring and nothing about framing quality. ADR-053 is explicit about why that distinction matters:
 * a stand-in that always answers cannot tell you whether the answer is any good. Real framing is
 * judged by `PSD_E2E_REAL_MODEL=1 npm run demo:record` and `scripts/avatar-align-check.ts`.
 */
export const FAKE_MEDIAPIPE = `
  export const FilesetResolver = { forVisionTasks: async () => ({}) };
  export const FaceDetector = {
    createFromOptions: async () => ({
      detect: () => ({
        detections: [{
          boundingBox: { originX: 220, originY: 130, width: 200, height: 240 },
          keypoints: [{ x: 0.46, y: 0.30 }, { x: 0.54, y: 0.30 }],
        }],
      }),
    }),
  };
`;

/** The detector loads perfectly well and simply sees no face — a photo of a plate of noodles. */
export const MEDIAPIPE_SEES_NOTHING = `
  export const FilesetResolver = { forVisionTasks: async () => ({}) };
  export const FaceDetector = {
    createFromOptions: async () => ({ detect: () => ({ detections: [] }) }),
  };
`;

/**
 * State the face locator's availability for a test. `'found'` frames the face, `'blind'` loads but
 * finds nothing, `'offline'` cannot be fetched at all — three different routes to the same honest
 * answer, and a test should say which one it means.
 */
export async function mediapipe(page: Page, mode: 'found' | 'blind' | 'offline'): Promise<void> {
  if (mode === 'offline') {
    await page.route(MEDIAPIPE_CDN, (route) => route.abort());
    return;
  }
  const body = mode === 'found' ? FAKE_MEDIAPIPE : MEDIAPIPE_SEES_NOTHING;
  await page.route(MEDIAPIPE_CDN, (route) =>
    route.fulfill({ contentType: 'text/javascript', body }),
  );
}

/**
 * The opposite: a browser with NO FaceDetector, enforced rather than assumed. A test
 * that means "nothing can find the face" must say so — on a host whose Chromium ships
 * the Shape Detection API, a real detector would otherwise find the face and turn the
 * manual-crop path into the plain-wall path, failing the test for the wrong reason.
 * The app's check is `FaceDetector === undefined` (readPhoto.ts), so undefined it is.
 */
export const NO_FACE_DETECTOR = `
  Object.defineProperty(window, 'FaceDetector', { value: undefined, configurable: true });
`;

/**
 * ADR-044 — the two camera refusals, as the browser delivers them, because Chromium's
 * `--use-fake-ui-for-media-stream` grants the prompt unconditionally: withholding the
 * Playwright permission is not enough to reach these branches on either engine.
 *
 * `NO_CAMERA` is a device with no capture API at all (`isSupported: false` in
 * `useCameraSession`); `CAMERA_REFUSED` is the participant tapping "Don't Allow".
 */
export const NO_CAMERA = `
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
`;

export const CAMERA_REFUSED = `
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async () => {
        const error = new Error('Permission denied');
        error.name = 'NotAllowedError';
        throw error;
      },
    },
  });
`;

/**
 * ADR-041/043 — `segmentPhoto.ts` picks its device ladder off `'gpu' in navigator`, which is
 * a fact about the host's browser build, not about the phone the event will use. Pin it both
 * ways, so "Safari ships navigator.gpu and its WebGPU backend throws" is a test rather than
 * a hope. Absence has to be real absence: `in` is true for a property set to `undefined`.
 */
const gpuThatAnswers = (adapter: string) => `
  Object.defineProperty(Navigator.prototype, 'gpu', {
    configurable: true,
    value: { requestAdapter: async () => ${adapter} },
  });
`;

/** A browser with WebGPU that works: an adapter is handed over, so the fast device is tried. */
export const WITH_WEBGPU = gpuThatAnswers('({ name: "stand-in adapter" })');

/**
 * ADR-045 — the shape that used to cost the model its only attempt: `navigator.gpu` is
 * advertised and no adapter comes out of it (headless CI, plenty of real Safari builds).
 */
export const WEBGPU_WITHOUT_ADAPTER = gpuThatAnswers('null');

export const NO_WEBGPU = `
  delete Navigator.prototype.gpu;
  delete navigator.gpu;
`;

/** Where the recording stand-in below leaves its log, on the page under test. */
export const MODEL_CALLS_KEY = '__psdModelCalls';

/**
 * A Transformers.js stand-in that says what it was ASKED for — `task|model|device`, one entry
 * per `pipeline()` call — and can refuse a device the way a browser whose WebGPU backend is
 * unproven does. This is how the "the library is there and working" branches get asserted
 * rather than assumed: the app's half of the contract with the real library
 * (`background-removal`, `Xenova/modnet`, and the device ladder) becomes visible.
 */
export function recordingTransformers(refuse?: 'webgpu' | 'wasm'): string {
  return `
  ${RAW_IMAGE}
  const asked = (globalThis.${MODEL_CALLS_KEY} = globalThis.${MODEL_CALLS_KEY} ?? []);
  export async function pipeline(task, model, options) {
    const device = options && options.device;
    asked.push([task, model, device].join('|'));
    if (device === ${JSON.stringify(refuse ?? null)}) {
      throw new Error('the ' + device + ' backend refused this build');
    }
  ${MASK_RUNNER}
  }
`;
}

/** What the page asked of the model, in order. */
export function modelCalls(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => (globalThis as unknown as Record<string, string[] | undefined>)[key] ?? [],
    MODEL_CALLS_KEY,
  );
}

/**
 * Every photo suite starts the same way: a participant who exists, signed in through the real
 * screen, with the avatar studio open on their profile. One copy, so a change to the route or
 * the testids is one edit (`label` only keeps the generated nicknames readable in a dump).
 */
export async function openStudio(page: Page, label: string): Promise<void> {
  const nickname = unique(`${label}${Math.random().toString(36).slice(2, 6)}`);
  await apiSignUp(page.request, { nickname });
  await signInParticipant(page, nickname);
  await page.goto('/me');
  await page.getByTestId('profile__look-edit').click();
  await expect(page.getByTestId('avatar-studio__photo-state')).toBeVisible();
}

/**
 * ADR-229 — a photograph reaches the draft only through "Use this square", and that closes the dialog. Until it is
 * pressed the studio still shows the character, and the open dialog blocks the save.
 */
export async function useSquare(page: Page): Promise<void> {
  await page.getByTestId('photo-cropper__use').click();
  await expect(page.getByTestId('photo-dialog')).toBeHidden();
}

/** Save the draft and read back, through the real API, what the server now holds. */
export async function savedSprite(page: Page): Promise<string> {
  await page.getByTestId('profile__look-save').click();
  await expect(page.getByTestId('profile__look-saved')).toBeVisible();
  const me = await (await page.request.get('/api/me')).json();
  const id = me.participant.avatarPhotoId as string;
  expect(id).toMatch(/^[0-9a-f]{16}$/);
  const bodies = await (await page.request.get(`/api/avatars?ids=${id}`)).json();
  return bodies.items[0].sprite as string;
}

export const INGEST = fromRepo('images', 'ingest');

/** The whole corpus: this branch's pairs and the PR-2 adversarial set. */
export function corpus(): string[] {
  const pairs = readdirSync(INGEST)
    .filter((name) => name.startsWith('social-') && name.endsWith('.png'))
    .map((name) => join(INGEST, name));
  const adversarial = readdirSync(join(INGEST, 'social'))
    .filter((name) => name.endsWith('.png'))
    .map((name) => join(INGEST, 'social', name));
  const all = [...pairs, ...adversarial].sort();
  const sample = Number(process.env['PSD_E2E_PHOTO_SAMPLE'] ?? '1');
  return all.filter((_unused, index) => index % Math.max(1, sample) === 0);
}

/**
 * Numeric order on the leading number, then by name (ADR-218). A plain string sort puts `100-…`
 * between `10-…` and `11-…`, which would move every photo from `11-…` upward by one index.
 */
function bySocialNumber(a: string, b: string): number {
  const diff = Number.parseInt(a, 10) - Number.parseInt(b, 10);
  if (Number.isFinite(diff) && diff !== 0) return diff;
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** The adversarial set's filenames, in the stable sorted order every index below refers to. */
function socialNames(): string[] {
  return readdirSync(join(INGEST, 'social'))
    .filter((name) => name.endsWith('.png'))
    .sort(bySocialNumber);
}

/**
 * One photo from the adversarial set, by index, for the tests that need a background no
 * colour rule can cut out — a café, a crowd, a beach. Deliberately NOT sampled: a test
 * that names one photo must keep getting that photo whatever PSD_E2E_PHOTO_SAMPLE says.
 */
export function busyPhoto(index = 0): string {
  const name = socialNames()[index];
  if (name === undefined) throw new Error(`images/ingest/social has no photo ${index}`);
  return join(INGEST, 'social', name);
}

/**
 * How many photos `busyPhoto` can reach (ADR-071).
 *
 * Exported so a caller taking a fixed number of picks can compute a stride across the whole
 * corpus instead of hard-coding its size — a constant that would silently stop spreading the
 * moment a photo is added or removed.
 */
export function socialPhotoCount(): number {
  return socialNames().length;
}
