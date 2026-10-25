import type { Bitmap, CropBox } from './photoSprite.js';

/**
 * ADR-054 — where the face actually is, from a face detector.
 *
 * This replaces `headBoxFromMask`, which inferred a head from MODNET's silhouette and was wrong
 * for every photo that is not a bust: framed head-to-waist it called the whole person a head, and
 * with a raised arm it measured from the hand holding the phone and produced a picture of a hand
 * (ADR-053). A mask says where a *person* is; it can never say where a *face* is. So the two jobs
 * are split — MODNET keeps the cut-out, and a real detector does the finding.
 *
 * BlazeFace short-range through `@mediapipe/tasks-vision`, loaded from a CDN at run time for the
 * same reason Transformers.js is (ADR-033): its WebAssembly has no business in the download of an
 * app whose main job on the day is showing a QR code on a beach. `warmUpFaceLocator()` starts that
 * fetch in the background when the studio opens, so by the time a photo is chosen it is usually
 * already there.
 *
 * Like `segmentPhoto.ts`, nothing here throws. Every failure returns null, and null means "ask the
 * participant to place the square" (ADR-036) — never a guess dressed up as an answer.
 */

const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const WASM_ROOT = `${TASKS_VISION_URL}/wasm`;
/**
 * Full-range, 1.03 MB, and measured rather than assumed (ADR-054).
 *
 * Short-range is the obvious pick for "a selfie" and it is the wrong one for this corpus: it found
 * no face at all in **7 of the 14** social photographs — every landscape one, where the person is
 * in a scene rather than filling the frame. Full range found exactly one face in 13 of the 14 at
 * the default confidence. The remaining photo finds nothing and is asked for the square, which is
 * the honest outcome rather than a failure.
 */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';
/**
 * The library's own default, stated because it was tested. Lowering it to 0.2 to catch the last
 * photo is a bad trade: at 0.2 the detector reported ten faces in one photograph and found a face
 * in the PSD logo. A confident miss that asks for help beats a flood of false positives.
 */
const MIN_CONFIDENCE = 0.5;

/**
 * Crop size per unit of inter-ocular distance.
 *
 * Adult interpupillary distance is ~63 mm against a ~230 mm chin-to-crown head, so a head is about
 * 3.65 inter-ocular distances tall; `HEAD_SHARE` then gives the head 72 % of the crop. Hence
 * 3.65 / 0.72. Inter-ocular distance is used rather than the detector's box because it is the
 * steadiest scale in a photograph — unlike shoulder width it does not move with clothing, posture
 * or a raised arm.
 */
const CROP_PER_INTER_OCULAR = 3.65 / 0.72;
/** The drawn avatars' eye line, shared with `photoSprite.ts`. */
const EYE_LINE = 0.52;
/** A detector box is the face; a head is about half as tall again. Used only as a floor. */
const HEAD_OVER_FACE = 1.45;
const HEAD_SHARE = 0.72;

/** Normalised (0–1) keypoints, in BlazeFace's order: right eye, left eye, nose, mouth, ears. */
interface Keypoint {
  x: number;
  y: number;
}

interface Detection {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  keypoints?: Keypoint[];
}

interface DetectorLike {
  detect: (image: unknown) => { detections: Detection[] };
}

export interface TasksVisionModule {
  FilesetResolver: { forVisionTasks: (root: string) => Promise<unknown> };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<DetectorLike>;
  };
}

export type TasksVisionLoader = () => Promise<TasksVisionModule>;

/** Separated so tests can hand in a module without a network. */
export const loadTasksVision: TasksVisionLoader = () =>
  import(/* @vite-ignore */ TASKS_VISION_URL) as Promise<TasksVisionModule>;

let pending: Promise<DetectorLike> | null = null;

function detectorFor(load: TasksVisionLoader): Promise<DetectorLike> {
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

/**
 * Start fetching the detector without waiting for it.
 *
 * The weights are ~2.7 MB (ADR-054). The studio is reached after sign-up, so this runs while the
 * participant is still reading the screen and choosing a photo, and the cost is usually invisible.
 * Failures are swallowed here on purpose — this is a head start, not a step.
 */
export function warmUpFaceLocator(load: TasksVisionLoader = loadTasksVision): void {
  void detectorFor(load).catch(() => {
    pending = null;
  });
}

/**
 * MediaPipe wants an image source, not a pixel array, so the bitmap goes back through a canvas.
 * Cheap: these are at most 640 px on the long edge by the time they get here.
 */
function canvasFrom(bitmap: Bitmap): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  // `createImageData` rather than `new ImageData(pixels, …)`: the constructor insists on an
  // ArrayBuffer-backed array, and a `Bitmap`'s pixels may sit on any ArrayBufferLike.
  const image = context.createImageData(bitmap.width, bitmap.height);
  image.data.set(bitmap.pixels);
  context.putImageData(image, 0, 0);
  return canvas;
}

/** The biggest face in the picture: in a group shot, the one whose photo this is. */
function largestOf(detections: Detection[]): Detection | null {
  const ranked = [...detections].sort(
    (a, b) => (b.boundingBox?.width ?? 0) - (a.boundingBox?.width ?? 0),
  );
  return ranked[0] ?? null;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The crop, from the eye line.
 *
 * Inter-ocular distance sets the scale, but it shrinks as a head turns away, so the detector's own
 * box height is kept as a floor: a face in profile comes out framed a little wide rather than
 * cropped into.
 */
function cropFrom(face: Detection, bitmap: Bitmap): CropBox | null {
  const [right, left] = face.keypoints ?? [];
  const box = face.boundingBox;
  if (right === undefined || left === undefined) return null;

  const eyes = {
    x: ((right.x + left.x) / 2) * bitmap.width,
    y: ((right.y + left.y) / 2) * bitmap.height,
  };
  const apart = Math.hypot((right.x - left.x) * bitmap.width, (right.y - left.y) * bitmap.height);
  if (!Number.isFinite(apart) || apart < 2) return null;

  // The crop is a SQUARE, so the ceiling is the shortest edge — not the longest. A 640×480 photo
  // capped at 640 yields a box that cannot fit vertically at any offset, and the clamps below then
  // silently slide it off the bottom of the picture.
  const shortest = Math.min(bitmap.width, bitmap.height);
  const fromEyes = apart * CROP_PER_INTER_OCULAR;
  const fromBox = ((box?.height ?? 0) * HEAD_OVER_FACE) / HEAD_SHARE;
  const size = Math.min(shortest, Math.max(fromEyes, fromBox));
  return {
    x: clamp(eyes.x - size / 2, 0, Math.max(0, bitmap.width - size)),
    y: clamp(eyes.y - size * EYE_LINE, 0, Math.max(0, bitmap.height - size)),
    size,
  };
}

/**
 * The face's crop box, or null when there is no face to be had — because the detector could not be
 * loaded, because it found nothing, or because what it found had no eyes to measure. Never throws:
 * every one of those is a reason to ask for the manual square, not to lose the photo.
 */
export async function locateFace(
  bitmap: Bitmap,
  load: TasksVisionLoader = loadTasksVision,
): Promise<CropBox | null> {
  try {
    const detector = await detectorFor(load);
    const image = canvasFrom(bitmap);
    if (image === null) return null;
    const face = largestOf(detector.detect(image).detections ?? []);
    return face === null ? null : cropFrom(face, bitmap);
  } catch {
    pending = null;
    return null;
  }
}
