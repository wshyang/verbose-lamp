import type { Page } from '@playwright/test';

/**
 * Deterministic stand-ins for the two CDN model modules the avatar studio loads at run time.
 * They replace only the external inference boundary: the bundled photo, the crop maths, matte
 * clean-up, enamel backdrop, gold outline and gilding all run for real. That keeps the shots
 * reproducible offline and immune to model and CDN drift.
 *
 * The URLs are the ones `locateFace.ts` and `segmentSubject.ts` import; the e2e contract test
 * fails if either source stops naming them.
 */
export const TASKS_VISION_ROUTE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1*';
export const TRANSFORMERS_ROUTE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0*';

const JAVASCRIPT_HEADERS = {
  'access-control-allow-origin': '*',
  'cross-origin-resource-policy': 'cross-origin',
};

const FACE_MODULE = `
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const FaceDetector = {
  createFromOptions: async () => ({
    detect: (source) => {
      const width = source.width || 480;
      const height = source.height || 640;
      return {
        detections: [{
          boundingBox: { originX: width * 0.395, originY: height * 0.28, width: width * 0.26, height: height * 0.22 },
          keypoints: [
            { x: 0.455, y: 0.395 }, { x: 0.598, y: 0.395 }, { x: 0.526, y: 0.445 },
            { x: 0.526, y: 0.485 }, { x: 0.41, y: 0.41 }, { x: 0.65, y: 0.41 },
          ],
        }],
      };
    },
  }),
};
`;

// The bundled portrait's silhouette as scanline ranges [y, left, right], traced from the hair
// crown through the shoulders. Below the first row there is no subject.
const SEGMENTATION_MODULE = `
export class RawImage {
  constructor(data, width, height, channels) {
    this.data = data; this.width = width; this.height = height; this.channels = channels;
  }
}
const PROFILE = [
  [0.26, 0.49, 0.56], [0.278, 0.445, 0.605], [0.295, 0.42, 0.63], [0.318, 0.395, 0.655],
  [0.345, 0.375, 0.675], [0.38, 0.36, 0.69], [0.42, 0.345, 0.705], [0.5, 0.34, 0.71],
  [0.55, 0.305, 0.79], [0.65, 0.255, 0.82], [0.8, 0.2, 0.855], [1, 0.16, 0.865],
];
function range(y) {
  if (y < PROFILE[0][0]) return null;
  for (let i = 1; i < PROFILE.length; i += 1) {
    const a = PROFILE[i - 1];
    const b = PROFILE[i];
    if (y > b[0]) continue;
    const mix = (y - a[0]) / (b[0] - a[0]);
    return [a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
  }
  return PROFILE.at(-1).slice(1);
}
export async function pipeline() {
  return async (image) => {
    const { width, height } = image;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const r = range(y / height);
      for (let x = 0; x < width; x += 1) {
        const inside = r !== null && x / width >= r[0] && x / width <= r[1];
        const o = (y * width + x) * 4;
        data[o] = 255; data[o + 1] = 255; data[o + 2] = 255; data[o + 3] = inside ? 255 : 0;
      }
    }
    return { data, width, height, channels: 4 };
  };
}
`;

export async function stubModelModules(page: Page): Promise<void> {
  await page.route(TASKS_VISION_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: JAVASCRIPT_HEADERS, body: FACE_MODULE }),
  );
  await page.route(TRANSFORMERS_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', headers: JAVASCRIPT_HEADERS, body: SEGMENTATION_MODULE }),
  );
}

/** The two model hosts, severed: the deterministic path that needs no network at all. */
export async function severModelHosts(page: Page): Promise<void> {
  for (const host of ['**/cdn.jsdelivr.net/**', '**/storage.googleapis.com/**']) {
    await page.route(host, (route) => route.abort());
  }
}
