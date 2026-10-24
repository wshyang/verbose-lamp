import type { FaceReading, Point, RgbaImage } from '../types';

/**
 * ADDENDUM-017 — the face detector, ported from the beach app's avatar studio.
 *
 * BlazeFace full-range through `@mediapipe/tasks-vision`, loaded from a CDN at run time:
 * its WebAssembly has no business in the download of an app whose main job on the day is
 * showing a QR code on a beach, and the same argument holds here.
 *
 * Nothing in this module throws. Every failure returns null, and null means "carry on
 * with the estimate" — never a guess dressed up as an answer.
 */

/**
 * The versions tried, in order. The newest is tried first and the older ones are
 * fallbacks, because a pinned CDN version that stops being served would otherwise take
 * the whole studio with it.
 */
const TASKS_VISION_CANDIDATES: readonly string[] = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1',
];

/**
 * Full-range, and measured rather than assumed.
 *
 * Short-range is the obvious pick for "a selfie" and it is the wrong one for a portrait
 * taken in a room: it found no face at all in half of the source app's photographs —
 * every landscape one, where the person is in a scene rather than filling the frame.
 */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';

/**
 * The library's own default, stated because it was tested. Lowering it to 0.2 to catch
 * the last photo is a bad trade: at 0.2 the detector reported ten faces in one
 * photograph and found a face in a logo. A confident miss beats a flood of false hits.
 */
const MIN_CONFIDENCE = 0.5;

interface Detection {
  readonly boundingBox?: {
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly keypoints?: readonly { readonly x: number; readonly y: number }[];
}

interface DetectorLike {
  detect: (image: unknown) => { readonly detections: readonly Detection[] };
}

export interface TasksVisionModule {
  readonly FilesetResolver: { forVisionTasks: (root: string) => Promise<unknown> };
  readonly FaceDetector: {
    createFromOptions: (
      fileset: unknown,
      options: Record<string, unknown>
    ) => Promise<DetectorLike>;
  };
}

export type TasksVisionLoader = (url: string) => Promise<TasksVisionModule>;

/** Separated so tests can hand in a module without a network. */
export const loadTasksVision: TasksVisionLoader = (url) =>
  import(/* @vite-ignore */ url) as Promise<TasksVisionModule>;

let pending: Promise<DetectorLike> | null = null;

/** The biggest face in the picture: in a group shot, the one whose portrait this is. */
function largestOf(detections: readonly Detection[]): Detection | null {
  const ranked = [...detections].sort(
    (left, right) => (right.boundingBox?.width ?? 0) - (left.boundingBox?.width ?? 0)
  );
  return ranked[0] ?? null;
}

/** MediaPipe wants an image source, not a pixel array, so the picture goes through a canvas. */
function canvasFrom(image: RgbaImage): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function detectorFor(load: TasksVisionLoader): Promise<DetectorLike> {
  pending ??= (async () => {
    let refused: unknown = new Error('the face detector could not be loaded');
    for (const url of TASKS_VISION_CANDIDATES) {
      try {
        const module = await load(url);
        const fileset = await module.FilesetResolver.forVisionTasks(`${url}/wasm`);
        return await module.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: MIN_CONFIDENCE,
        });
      } catch (error) {
        refused = error;
      }
    }
    throw refused;
  })();
  return pending;
}

/** Testing seam: forget the loaded detector so the next call starts again. */
export function forgetFaceDetector(): void {
  pending = null;
}

/**
 * Start fetching the detector without waiting for it.
 *
 * The weights are a couple of megabytes. The studio is reached after the sequence has
 * played, so this runs while the visitor is still reading the screen, and the cost is
 * usually invisible. Failures are swallowed here on purpose — this is a head start, not
 * a step.
 */
export function warmUpFaceDetector(load: TasksVisionLoader = loadTasksVision): void {
  void detectorFor(load).catch(() => {
    pending = null;
  });
}

/**
 * The face in the photograph, or null when there is none to be had — because the
 * detector could not be loaded, because it found nothing, or because what it found had
 * no eyes to measure.
 */
export async function detectFace(
  image: RgbaImage,
  load: TasksVisionLoader = loadTasksVision
): Promise<FaceReading | null> {
  try {
    const detector = await detectorFor(load);
    const canvas = canvasFrom(image);
    if (canvas === null) return null;
    const best = largestOf(detector.detect(canvas).detections);
    if (best === null) return null;
    const keypoints: Point[] = (best.keypoints ?? []).map((point) => ({
      x: point.x,
      y: point.y,
    }));
    const box = best.boundingBox;
    return {
      keypoints,
      box: box
        ? { x: box.originX, y: box.originY, width: box.width, height: box.height }
        : undefined,
    };
  } catch {
    pending = null;
    return null;
  }
}
