import type { AlphaMask, RgbaImage } from '../types';

/**
 * ADDENDUM-017 — the background, taken away by a segmentation model in the browser.
 *
 * The colour-based cut-out is exact on a studio wall and helpless against a portrait
 * taken in a room. Transformers.js running MODNET through ONNX Runtime Web handles
 * those, and still never sends the photograph anywhere — the model comes to the picture
 * rather than the picture going to a server.
 *
 * It is an *upgrade*, never a requirement. The library and the weights are fetched on
 * first use only; if the network, the browser or the CDN says no, `segmentSubject`
 * returns null and the caller keeps the photograph it already had.
 */

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';

/** Portrait matting, the model the source app used; small enough to fetch once. */
const MODEL = 'Xenova/modnet';

interface PixelPlane {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels?: number;
}

export interface TransformersModule {
  readonly pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>
  ) => Promise<(image: unknown) => Promise<unknown>>;
  readonly RawImage: new (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    channels: number
  ) => unknown;
  readonly env?: { allowLocalModels?: boolean };
}

export type TransformersLoader = () => Promise<TransformersModule>;

/** Separated so tests can hand in a module without a network. */
export const loadTransformers: TransformersLoader = () =>
  import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersModule>;

interface Segmenter {
  readonly run: (image: unknown) => Promise<unknown>;
  readonly toImage: (bitmap: RgbaImage) => unknown;
}

let pending: Promise<Segmenter> | null = null;

/**
 * The model runs on WebAssembly, always.
 *
 * Measured on a real webcam frame in Chromium, WebGPU gave a mean face alpha of 157/255
 * against 232/255 on WASM, and put holes through the forehead, the cheek and the nose.
 * A correct cut-out beats a fast wrong one, so WebGPU is not asked for.
 */
async function devicesToTry(): Promise<string[]> {
  return ['wasm'];
}

/** The model is fetched once per session and kept; the browser caches the weights. */
async function segmenterFor(load: TransformersLoader): Promise<Segmenter> {
  pending ??= load().then(async (module) => {
    if (module.env) module.env.allowLocalModels = false;
    const devices = await devicesToTry();
    let refused: unknown = new Error('no device to run the model on');
    for (const device of devices) {
      try {
        const run = await module.pipeline('background-removal', MODEL, { device });
        return {
          run,
          toImage: (bitmap: RgbaImage) =>
            new module.RawImage(bitmap.data as Uint8ClampedArray, bitmap.width, bitmap.height, 4),
        };
      } catch (error) {
        refused = error;
      }
    }
    throw refused;
  });
  return pending;
}

/** Testing seam: forget the loaded model so the next call starts again. */
export function forgetSegmenter(): void {
  pending = null;
}

/** The plane to read the matte out of, whichever shape the pipeline answered in. */
function planeOf(result: unknown): PixelPlane | null {
  const answer = Array.isArray(result) ? result[0] : result;
  if (answer === null || typeof answer !== 'object') return null;
  const candidate = answer as { mask?: unknown; data?: unknown };
  if (candidate.mask !== null && typeof candidate.mask === 'object') {
    return candidate.mask as PixelPlane;
  }
  if (candidate.data !== undefined) return answer as PixelPlane;
  return null;
}

/**
 * One byte of subject-ness per pixel. A single-channel plane IS that already; a
 * four-channel image carries it in the alpha, which is what `background-removal` cuts
 * out. Anything else — an RGB image with no transparency to read — is not a matte, so it
 * is a fall-back, not a guess.
 */
function alphaOf(plane: PixelPlane): AlphaMask | null {
  const { width, height } = plane;
  const channels = plane.channels ?? 1;
  if (width <= 0 || height <= 0) return null;
  if (plane.data.length !== width * height * channels) return null;
  if (channels === 1) return { width, height, data: Uint8ClampedArray.from(plane.data) };
  if (channels !== 4) return null;
  const alpha = new Uint8ClampedArray(width * height);
  for (let at = 0; at < alpha.length; at += 1) alpha[at] = Number(plane.data[at * 4 + 3]);
  return { width, height, data: alpha };
}

/** The matte brought back to the size of the photograph it was cut from. */
function resample(
  mask: AlphaMask,
  width: number,
  height: number
): AlphaMask {
  if (mask.width === width && mask.height === height) return mask;
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    const from = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / height));
    for (let x = 0; x < width; x += 1) {
      const column = Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / width));
      data[y * width + x] = mask.data[from * mask.width + column] ?? 0;
    }
  }
  return { width, height, data };
}

/**
 * The subject's matte, or null when the model cannot be had. Never throws: every
 * failure here is a reason to fall back, not a reason to lose the photograph.
 */
export async function segmentSubject(
  image: RgbaImage,
  load: TransformersLoader = loadTransformers
): Promise<AlphaMask | null> {
  try {
    const segmenter = await segmenterFor(load);
    const plane = planeOf(await segmenter.run(segmenter.toImage(image)));
    if (plane === null) return null;
    const alpha = alphaOf(plane);
    if (alpha === null) return null;
    return resample(alpha, image.width, image.height);
  } catch {
    pending = null;
    return null;
  }
}
