import type { Bitmap, SubjectMask } from './photoSprite.js';

/**
 * ADR-033 — background removal by a segmentation model, in the browser.
 *
 * The colour-based cut-out (ADR-031/032) is exact on a studio or booth wall and helpless
 * against a selfie: a café, a beach, a crowd. Transformers.js running MODNET through ONNX
 * Runtime Web handles those, and still never sends the photograph anywhere — the model
 * comes to the picture rather than the picture going to a server.
 *
 * It is an *upgrade*, never a requirement. The library and the weights are fetched on
 * first use only; if the network, the browser or the CDN says no, `segmentSubject`
 * returns null and the caller keeps the colour cut-out it already has.
 *
 * Transformers.js is loaded from a CDN at run time rather than bundled: it drags in
 * onnxruntime with WebAssembly binaries, and none of it should be in the download of an
 * app whose main job on the day is showing a QR code on a beach.
 */

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
/** Portrait matting, the model the article uses; small enough to fetch once on Wi-Fi. */
const MODEL = 'Xenova/modnet';

/**
 * ADR-045 — what a segmentation result looks like, in the two shapes the library actually
 * hands back. `background-removal` returns ONE image whose alpha channel is the matte;
 * `image-segmentation` (and every stand-in written against it) returns a list of
 * `{ mask }`, one channel per pixel. Both are read here so neither shape is a silent null.
 */
interface PixelPlane {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels?: number;
}

export interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<(image: unknown) => Promise<unknown>>;
  RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
}

export type TransformersLoader = () => Promise<TransformersModule>;

/** Separated so tests can hand in a module without a network. */
export const loadTransformers: TransformersLoader = () =>
  import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersModule>;

interface Segmenter {
  run: (image: unknown) => Promise<unknown>;
  toImage: (bitmap: Bitmap) => unknown;
}

let pending: Promise<Segmenter> | null = null;

/**
 * ADR-221 — the model runs on WebAssembly, always.
 *
 * ADR-045 asked for WebGPU wherever the browser handed over an adapter. Measured on a real
 * webcam frame in Chromium (same crop, same code, same fp32 weights) that gave a mean face alpha
 * of 232/255 on WASM and 157/255 on WebGPU, and the WebGPU matte put holes through the forehead,
 * cheek and nose. The sprite a participant saw had chunks of their face missing, and no threshold
 * could bring them back because the face was already under it. A correct cut-out beats a fast
 * wrong one, so WebGPU is no longer asked for.
 *
 * Still a list rather than a constant: `segmenterFor` walks it, and if WebGPU is ever re-enabled
 * (behind a check that the face survives) this is the one place that changes.
 */
async function devicesToTry(): Promise<string[]> {
  return ['wasm'];
}

/** The model is fetched once per session and kept; the browser caches the weights. */
async function segmenterFor(load: TransformersLoader): Promise<Segmenter> {
  pending ??= load().then(async (module) => {
    const devices = await devicesToTry();
    let refused: unknown = new Error('no device to run the model on');
    for (const device of devices) {
      try {
        const run = await module.pipeline('background-removal', MODEL, { device });
        return {
          run,
          toImage: (bitmap: Bitmap) =>
            new module.RawImage(bitmap.pixels, bitmap.width, bitmap.height, 4),
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
  if (candidate.mask !== null && typeof candidate.mask === 'object') return candidate.mask as PixelPlane;
  if (candidate.data !== undefined) return answer as PixelPlane;
  return null;
}

/**
 * One byte of subject-ness per pixel. A single-channel plane IS that already; a four-channel
 * image carries it in the alpha, which is what `background-removal` cuts out. Anything else —
 * an RGB image with no transparency to read — is not a matte, so it is a fall-back, not a guess.
 */
function alphaOf(plane: PixelPlane): SubjectMask | null {
  const { width, height } = plane;
  const channels = plane.channels ?? 1;
  if (plane.data.length !== width * height * channels) return null;
  if (channels === 1) return { width, height, alpha: Uint8Array.from(plane.data) };
  if (channels !== 4) return null;
  const alpha = new Uint8Array(width * height);
  for (let at = 0; at < alpha.length; at += 1) alpha[at] = Number(plane.data[at * 4 + 3]);
  return { width, height, alpha };
}

/**
 * The subject's alpha, or null when the model cannot be had. Never throws: every failure
 * here is a reason to fall back, not a reason to lose the photo.
 */
export async function segmentSubject(
  bitmap: Bitmap,
  load: TransformersLoader = loadTransformers,
): Promise<SubjectMask | null> {
  try {
    const segmenter = await segmenterFor(load);
    const plane = planeOf(await segmenter.run(segmenter.toImage(bitmap)));
    return plane === null ? null : alphaOf(plane);
  } catch {
    pending = null;
    return null;
  }
}
