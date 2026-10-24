import type { RgbaImage, SubjectMask } from './types';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
const MODEL = 'Xenova/modnet';

interface PixelPlane {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels?: number;
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

interface Segmenter {
  readonly run: (image: unknown) => Promise<unknown>;
  readonly toImage: (image: RgbaImage) => unknown;
}

export const loadTransformers: TransformersLoader = () =>
  import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersModule>;

let pendingSegmenter: Promise<Segmenter> | null = null;

async function segmenterFor(load: TransformersLoader): Promise<Segmenter> {
  pendingSegmenter ??= load().then(async (module) => {
    const run = await module.pipeline('background-removal', MODEL, { device: 'wasm' });
    return {
      run,
      toImage: (image) => new module.RawImage(
        new Uint8ClampedArray(image.data), image.width, image.height, 4,
      ),
    };
  });
  return pendingSegmenter;
}

function planeOf(result: unknown): PixelPlane | null {
  const answer = Array.isArray(result) ? result[0] : result;
  if (answer === null || typeof answer !== 'object') return null;
  const candidate = answer as { mask?: unknown; data?: unknown };
  if (candidate.mask !== null && typeof candidate.mask === 'object') return candidate.mask as PixelPlane;
  return candidate.data === undefined ? null : answer as PixelPlane;
}

export function alphaFromPlane(plane: PixelPlane): SubjectMask | null {
  const channels = plane.channels ?? 1;
  if (plane.data.length !== plane.width * plane.height * channels) return null;
  if (channels === 1) return { width: plane.width, height: plane.height, alpha: Uint8Array.from(plane.data) };
  if (channels !== 4) return null;
  const alpha = new Uint8Array(plane.width * plane.height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = Number(plane.data[pixel * 4 + 3]);
  return { width: plane.width, height: plane.height, alpha };
}

export function forgetSubjectSegmenter(): void {
  pendingSegmenter = null;
}

export async function segmentPortraitSubject(
  image: RgbaImage,
  load: TransformersLoader = loadTransformers,
): Promise<SubjectMask | null> {
  try {
    const segmenter = await segmenterFor(load);
    const plane = planeOf(await segmenter.run(segmenter.toImage(image)));
    return plane ? alphaFromPlane(plane) : null;
  } catch {
    pendingSegmenter = null;
    return null;
  }
}