import type { FaceBox, FaceDetection, RgbaImage } from './types';

const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const WASM_ROOT = `${TASKS_VISION_URL}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite';

interface MediaPipeDetection {
  readonly boundingBox?: {
    readonly originX: number;
    readonly originY: number;
    readonly width: number;
    readonly height: number;
  };
  readonly categories?: readonly { readonly score?: number }[];
}

interface DetectorLike {
  detect: (image: unknown) => { detections?: MediaPipeDetection[] };
}

export interface TasksVisionModule {
  FilesetResolver: { forVisionTasks: (root: string) => Promise<unknown> };
  FaceDetector: {
    createFromOptions: (fileset: unknown, options: Record<string, unknown>) => Promise<DetectorLike>;
  };
}

export type TasksVisionLoader = () => Promise<TasksVisionModule>;

interface NativeDetection {
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

interface NativeFaceDetector {
  detect: (image: CanvasImageSource) => Promise<readonly NativeDetection[]>;
}

type NativeFaceDetectorClass = new (options?: Record<string, unknown>) => NativeFaceDetector;

export const loadTasksVision: TasksVisionLoader = () =>
  import(/* @vite-ignore */ TASKS_VISION_URL) as Promise<TasksVisionModule>;

let pendingDetector: Promise<DetectorLike> | null = null;

function clamp(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(0, value));
}

export function clampFaceBox(box: FaceBox, image: Pick<RgbaImage, 'width' | 'height'>): FaceBox {
  const x = clamp(box.x, image.width);
  const y = clamp(box.y, image.height);
  return {
    x,
    y,
    width: clamp(box.width, image.width - x),
    height: clamp(box.height, image.height - y),
  };
}

export function selectLargestFace(boxes: readonly FaceBox[]): FaceBox | null {
  const ranked = [...boxes].sort((left, right) => right.width * right.height - left.width * left.height);
  return ranked[0] ?? null;
}

function canvasFrom(image: RgbaImage): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function detectorFor(load: TasksVisionLoader): Promise<DetectorLike> {
  pendingDetector ??= load().then(async (module) => {
    const fileset = await module.FilesetResolver.forVisionTasks(WASM_ROOT);
    return module.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
  });
  return pendingDetector;
}

async function detectWithBrowser(canvas: HTMLCanvasElement): Promise<FaceDetection | null> {
  const Detector = (globalThis as { FaceDetector?: NativeFaceDetectorClass }).FaceDetector;
  if (!Detector) return null;
  const faces = await new Detector({ fastMode: true, maxDetectedFaces: 5 }).detect(canvas).catch(() => []);
  const box = selectLargestFace(faces.map((face) => face.boundingBox));
  return box ? { box, confidence: null, source: 'browser' } : null;
}

function detectionFromMediaPipe(detections: readonly MediaPipeDetection[]): FaceDetection | null {
  const usable = detections.filter((item) => item.boundingBox !== undefined);
  const boxes = usable.map((item) => {
    const box = item.boundingBox!;
    return { x: box.originX, y: box.originY, width: box.width, height: box.height };
  });
  const selected = selectLargestFace(boxes);
  if (!selected) return null;
  const match = usable.find((item) => item.boundingBox?.width === selected.width);
  return { box: selected, confidence: match?.categories?.[0]?.score ?? null, source: 'mediapipe' };
}

async function detectWithMediaPipe(canvas: HTMLCanvasElement, load: TasksVisionLoader): Promise<FaceDetection | null> {
  const detector = await detectorFor(load);
  return detectionFromMediaPipe(detector.detect(canvas).detections ?? []);
}

export function forgetFaceDetector(): void {
  pendingDetector = null;
}

export function warmUpFaceDetector(load: TasksVisionLoader = loadTasksVision): void {
  void detectorFor(load).catch(() => { pendingDetector = null; });
}

export async function detectPortraitFace(
  image: RgbaImage,
  load: TasksVisionLoader = loadTasksVision,
): Promise<FaceDetection | null> {
  const canvas = canvasFrom(image);
  if (!canvas) return null;
  const native = await detectWithBrowser(canvas);
  if (native) return { ...native, box: clampFaceBox(native.box, image) };
  try {
    const detected = await detectWithMediaPipe(canvas, load);
    return detected ? { ...detected, box: clampFaceBox(detected.box, image) } : null;
  } catch {
    pendingDetector = null;
    return null;
  }
}