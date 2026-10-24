import type { RgbaImage } from '@/shared/lib/raster';
import { alphaOf, planeOf } from './matte';
import type { SegmentationPipeline, SubjectMatte, TransformersLoader, TransformersModule } from './types';

/**
 * Thin loader around Transformers.js running MODNet portrait matting (ADDENDUM-017 §3.2).
 *
 * The photo never leaves the browser: the model comes to the picture. Library and weights
 * are fetched on first use only, and every failure returns null so the studio can fall
 * back to the full photo honestly instead of guessing at a cut-out.
 */
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
export const SEGMENTATION_MODEL = 'Xenova/modnet';
/**
 * WebAssembly only. The reference measured WebGPU mattes punching holes through foreheads
 * and cheeks (mean face alpha 157 vs 232 on WASM); a correct cut-out beats a fast wrong one.
 */
const DEVICE = 'wasm';

export const loadTransformers: TransformersLoader = () =>
  import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersModule>;

interface Segmenter {
  readonly run: SegmentationPipeline;
  readonly toInput: (image: RgbaImage) => unknown;
}

let pending: Promise<Segmenter> | null = null;

function segmenterFor(load: TransformersLoader): Promise<Segmenter> {
  pending ??= load().then(async (module) => {
    const run = await module.pipeline('background-removal', SEGMENTATION_MODEL, { device: DEVICE });
    return {
      run,
      toInput: (image: RgbaImage) => new module.RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4),
    };
  });
  return pending;
}

/** Testing seam: forget the loaded model so the next call starts again. */
export function forgetSegmenter(): void {
  pending = null;
}

/** Start the download without waiting; failures are silent. */
export function warmUpSegmenter(load: TransformersLoader = loadTransformers): void {
  void segmenterFor(load).catch(() => {
    pending = null;
  });
}

/** The subject matte over the whole photo, or null when the model cannot be had. Never throws. */
export async function segmentSubject(image: RgbaImage, load: TransformersLoader = loadTransformers): Promise<SubjectMatte | null> {
  try {
    const segmenter = await segmenterFor(load);
    const plane = planeOf(await segmenter.run(segmenter.toInput(image)));
    const matte = plane === null ? null : alphaOf(plane);
    if (matte === null || matte.width !== image.width || matte.height !== image.height) return null;
    return matte;
  } catch {
    pending = null;
    return null;
  }
}
