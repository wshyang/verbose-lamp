import { expect, test, type Page } from '@playwright/test';

const JAVASCRIPT_HEADERS = {
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
};

/**
 * Deterministic replacements for the two CDN model modules. They only replace
 * the external inference boundary: Wei_Ling's bundled photo, the application's
 * crop maths, matte cleanup, enamel backdrop, gold outline, and gilding all
 * run for real. This keeps the Phase 4 shots reproducible offline and immune
 * to CDN/model drift (ADDENDUM-022 §8).
 */
const FACE_MODULE = `
export const FilesetResolver = {
  forVisionTasks: async () => ({}),
};
export const FaceDetector = {
  createFromOptions: async () => ({
    detect: (source) => {
      const width = source.width || 480;
      const height = source.height || 640;
      return {
        detections: [{
          boundingBox: {
            originX: width * 0.395,
            originY: height * 0.28,
            width: width * 0.26,
            height: height * 0.22,
          },
          keypoints: [
            { x: 0.455, y: 0.395 },
            { x: 0.598, y: 0.395 },
            { x: 0.526, y: 0.445 },
            { x: 0.526, y: 0.485 },
            { x: 0.41, y: 0.41 },
            { x: 0.65, y: 0.41 },
          ],
        }],
      };
    },
  }),
};
`;

const SEGMENTATION_MODULE = `
export class RawImage {
  constructor(data, width, height, channels) {
    this.data = data;
    this.width = width;
    this.height = height;
    this.channels = channels;
  }
}

// Wei_Ling's fixed-sample silhouette as scanline ranges: [y, left, right],
// traced from hair crown through shoulders/torso in the bundled portrait.
const SUBJECT_PROFILE = [
  [0.26, 0.49, 0.56],
  [0.278, 0.445, 0.605],
  [0.295, 0.42, 0.63],
  [0.318, 0.395, 0.655],
  [0.345, 0.375, 0.675],
  [0.38, 0.36, 0.69],
  [0.42, 0.345, 0.705],
  [0.5, 0.34, 0.71],
  [0.55, 0.305, 0.79],
  [0.65, 0.255, 0.82],
  [0.8, 0.2, 0.855],
  [1, 0.16, 0.865],
];

function subjectRange(y) {
  if (y < SUBJECT_PROFILE[0][0]) return null;
  for (let index = 1; index < SUBJECT_PROFILE.length; index += 1) {
    const previous = SUBJECT_PROFILE[index - 1];
    const next = SUBJECT_PROFILE[index];
    if (y > next[0]) continue;
    const mix = (y - previous[0]) / (next[0] - previous[0]);
    return [
      previous[1] + (next[1] - previous[1]) * mix,
      previous[2] + (next[2] - previous[2]) * mix,
    ];
  }
  return SUBJECT_PROFILE.at(-1).slice(1);
}

export async function pipeline() {
  return async (image) => {
    const { width, height } = image;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const range = subjectRange(y / height);
      for (let x = 0; x < width; x += 1) {
        const nx = x / width;
        const subject = range !== null && nx >= range[0] && nx <= range[1];
        const offset = (y * width + x) * 4;
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = subject ? 255 : 0;
      }
    }
    return { data, width, height, channels: 4 };
  };
}
`;

async function stubModelModules(page: Page) {
  await page.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      headers: JAVASCRIPT_HEADERS,
      body: FACE_MODULE,
    });
  });
  await page.route('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      headers: JAVASCRIPT_HEADERS,
      body: SEGMENTATION_MODULE,
    });
  });
}

test('wei-ling-cut-out-and-gilding', async ({ page }) => {
  // The 512² gilding pass is CPU-bound in software-rendered CI; the global
  // likeness timeout covers one frozen frame, not two avatar compositions.
  test.setTimeout(360_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubModelModules(page);
  await page.goto('/?freezeAt=33.8');
  await page.waitForSelector('[data-testid="cinematic-stage__canvas"][data-frame-ready="true"]');
  await page.getByTestId('avatar-studio__launch').click();
  await page.getByTestId('avatar-studio__sample-wei-ling').click();

  const state = page.getByTestId('avatar-studio__state');
  await expect(state).toHaveText('Background removed. Move the square if the framing is off.', {
    timeout: 120_000,
  });
  const preview = page.getByTestId('avatar-studio__preview-canvas');
  await expect
    .poll(async () => preview.evaluate((canvas: HTMLCanvasElement) => [canvas.width, canvas.height].join('x')))
    .toBe('512x512');
  await expect(preview).toHaveScreenshot('wei-ling-cut-out.png', { timeout: 120_000 });

  await page.getByTestId('avatar-studio__subject-finish').filter({ hasText: 'Gild subject' }).click();
  await expect(preview).toHaveScreenshot('wei-ling-gilded.png', { timeout: 120_000 });
});
