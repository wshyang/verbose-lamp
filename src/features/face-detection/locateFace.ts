import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import { cropFromDetection, largestFace } from './framing';
import type { FaceDetector, ImageSourceFactory, LocateFaceOptions, TasksVisionLoader, TasksVisionModule } from './types';

/**
 * Thin loader around MediaPipe's BlazeFace detector (ADDENDUM-017 §3.1).
 *
 * The library and weights come from a CDN at run time, so none of it sits in the
 * single-file bundle. Nothing here throws: every failure returns null, and null means
 * "ask the person to place the square", never a guess dressed up as an answer.
 */
export const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const WASM_ROOT = `${TASKS_VISION_URL}/wasm`;
/** Full range, not short range: the reference measured 13/14 hits against 7/14 on scene photos. */
export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';
/** The library default, kept because lower values flood real photos with false faces. */
export const MIN_CONFIDENCE = 0.5;

export const loadTasksVision: TasksVisionLoader = () =>
  import(/* @vite-ignore */ TASKS_VISION_URL) as Promise<TasksVisionModule>;

let pending: Promise<FaceDetector> | null = null;

function detectorFor(load: TasksVisionLoader): Promise<FaceDetector> {
  pending ??= load().then(async (module) => {
    const fileset = await module.FilesetResolver.forVisionTasks(WASM_ROOT);
    return module.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: MIN_CONFIDENCE,
    });
  });
  return pending;
}

/** Testing seam: forget the loaded detector so the next call starts again. */
export function forgetFaceLocator(): void {
  pending = null;
}

/** Start the download without waiting. Failures are swallowed: this is a head start, not a step. */
export function warmUpFaceLocator(load: TasksVisionLoader = loadTasksVision): void {
  void detectorFor(load).catch(() => {
    pending = null;
  });
}

/** MediaPipe wants an image source, so the pixels go back through a canvas. */
export const canvasSourceOf: ImageSourceFactory = (image) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
};

/** The face's avatar crop, or null when there is no face to be had. Never throws. */
export async function locateFace(image: RgbaImage, options: LocateFaceOptions = {}): Promise<SquareBox | null> {
  const { load = loadTasksVision, toSource = canvasSourceOf } = options;
  try {
    const detector = await detectorFor(load);
    const source = toSource(image);
    if (source === null || source === undefined) return null;
    const face = largestFace(detector.detect(source).detections ?? []);
    return face === null ? null : cropFromDetection(face, image);
  } catch {
    pending = null;
    return null;
  }
}
