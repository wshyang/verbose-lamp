import { cropFromFace, largestFace } from '../model/cropBox';
import type { CropBox, FaceDetection, RgbaImage } from '../model/types';
import { canvasFromImage } from './canvas';

/**
 * Face detection, ported from the reference app's `locateFace.ts` (ADR-054).
 *
 * BlazeFace full-range via `@mediapipe/tasks-vision`, loaded from a CDN at run time so its
 * WebAssembly never enters the bundle. Nothing here throws: every failure returns null,
 * and null means "fall back to a centred square" — never a guess dressed up as an answer.
 */
const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const WASM_ROOT = `${TASKS_VISION_URL}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';
const MIN_CONFIDENCE = 0.5;

interface RawDetection {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  keypoints?: { x: number; y: number }[];
}

interface DetectorLike {
  detect: (image: unknown) => { detections: RawDetection[] };
}

export interface TasksVisionModule {
  FilesetResolver: { forVisionTasks: (root: string) => Promise<unknown> };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<DetectorLike>;
  };
}

export type TasksVisionLoader = () => Promise<TasksVisionModule>;

export const loadTasksVision: TasksVisionLoader = () =>
  import(/* @vite-ignore */ `${TASKS_VISION_URL}/vision_bundle.mjs`) as Promise<TasksVisionModule>;

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

/** Start fetching the detector in the background; failures are a missed head start only. */
export function warmUpFaceLocator(load: TasksVisionLoader = loadTasksVision): void {
  void detectorFor(load).catch(() => {
    pending = null;
  });
}

/** Map MediaPipe's shape to the detector-neutral `FaceDetection`. */
export function toFaceDetection(raw: RawDetection): FaceDetection | null {
  const [rightEye, leftEye] = raw.keypoints ?? [];
  if (rightEye === undefined || leftEye === undefined) return null;
  return {
    rightEye,
    leftEye,
    boxHeight: raw.boundingBox?.height ?? 0,
    boxWidth: raw.boundingBox?.width ?? 0,
  };
}

export interface FaceLocation {
  readonly crop: CropBox;
  readonly face: FaceDetection;
}

export async function locateFace(image: RgbaImage, load: TasksVisionLoader = loadTasksVision): Promise<FaceLocation | null> {
  try {
    const detector = await detectorFor(load);
    const canvas = canvasFromImage(image);
    if (canvas === null) return null;
    const faces = (detector.detect(canvas).detections ?? []).map(toFaceDetection).filter((f): f is FaceDetection => f !== null);
    const face = largestFace(faces);
    const crop = face === null ? null : cropFromFace(face, image);
    return face === null || crop === null ? null : { crop, face };
  } catch {
    pending = null;
    return null;
  }
}
