import { alphaOf, planeOf } from '../model/matte';
import type { AlphaMask, RgbaImage } from '../model/types';

/**
 * Background removal in the browser, ported from the reference app's `segmentPhoto.ts`
 * (ADR-033 / ADR-221): Transformers.js running MODNET portrait matting on WebAssembly.
 * Loaded from a CDN on first use; the photograph never leaves the device. Never throws —
 * null means "no matte available", and the studio keeps the whole photo.
 */
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
const MODEL = 'Xenova/modnet';

export interface TransformersModule {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<(image: unknown) => Promise<unknown>>;
  RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
}

export type TransformersLoader = () => Promise<TransformersModule>;

export const loadTransformers: TransformersLoader = () =>
  import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersModule>;

interface Segmenter {
  readonly run: (image: unknown) => Promise<unknown>;
  readonly toImage: (image: RgbaImage) => unknown;
}

let pending: Promise<Segmenter> | null = null;

function segmenterFor(load: TransformersLoader): Promise<Segmenter> {
  pending ??= load().then(async (module) => {
    // WASM only: WebGPU mattes were measured to punch holes through faces (reference ADR-221).
    const run = await module.pipeline('background-removal', MODEL, { device: 'wasm' });
    return {
      run,
      toImage: (image: RgbaImage) => new module.RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4),
    };
  });
  return pending;
}

export function warmUpSegmenter(load: TransformersLoader = loadTransformers): void {
  void segmenterFor(load).catch(() => {
    pending = null;
  });
}

export async function segmentSubject(image: RgbaImage, load: TransformersLoader = loadTransformers): Promise<AlphaMask | null> {
  try {
    const segmenter = await segmenterFor(load);
    const plane = planeOf(await segmenter.run(segmenter.toImage(image)));
    return plane === null ? null : alphaOf(plane);
  } catch {
    pending = null;
    return null;
  }
}
