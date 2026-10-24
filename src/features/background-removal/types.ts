import type { AlphaMask } from '@/shared/lib/raster';

/** The model's matte over the whole photo: 0 = background, 255 = subject. */
export type SubjectMatte = AlphaMask;

/** How the matte becomes a keep/remove decision (ported from the reference `cutOut.ts`). */
export interface CutOutTuning {
  readonly removeBackground: boolean;
  /** A grid cell is background when its average matte alpha is below this. */
  readonly threshold: number;
  /** Connected subject pieces of this many cells or fewer are dropped (unless they hold the face). */
  readonly minIsland: number;
  /** Erode (negative) or grow (positive) the subject by whole cells. */
  readonly edge: number;
}

export type TuningKnob = 'threshold' | 'minIsland' | 'edge';

/** Row-major square grid of decisions: 1 = background cell, 0 = subject cell. */
export type DecisionGrid = Uint8Array;

/** A pixel buffer as returned by the segmentation library, in either of its two shapes. */
export interface PixelPlane {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  readonly channels?: number;
}

export type SegmentationPipeline = (image: unknown) => Promise<unknown>;

/** The slice of `@huggingface/transformers` this feature uses; tests hand in a fake. */
export interface TransformersModule {
  pipeline(task: string, model: string, options?: Record<string, unknown>): Promise<SegmentationPipeline>;
  readonly RawImage: new (data: Uint8ClampedArray, width: number, height: number, channels: number) => unknown;
}

export type TransformersLoader = () => Promise<TransformersModule>;
