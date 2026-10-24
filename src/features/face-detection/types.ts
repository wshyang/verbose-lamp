import type { RgbaImage } from '@/shared/lib/raster';

/** A keypoint normalised to 0–1 of the image. BlazeFace order: right eye, left eye, nose, mouth, ears. */
export interface FaceKeypoint {
  readonly x: number;
  readonly y: number;
}

/** MediaPipe reports the box in source pixels (unlike the keypoints, which are normalised). */
export interface FaceBoundingBox {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface FaceDetection {
  readonly boundingBox?: FaceBoundingBox;
  readonly keypoints?: readonly FaceKeypoint[];
}

export interface FaceDetector {
  detect(image: unknown): { readonly detections?: readonly FaceDetection[] };
}

/** The slice of `@mediapipe/tasks-vision` this feature uses; tests hand in a fake. */
export interface TasksVisionModule {
  readonly FilesetResolver: { forVisionTasks(root: string): Promise<unknown> };
  readonly FaceDetector: {
    createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<FaceDetector>;
  };
}

export type TasksVisionLoader = () => Promise<TasksVisionModule>;

/** Turns pixels into something the detector accepts (a canvas in browsers). Null when impossible. */
export type ImageSourceFactory = (image: RgbaImage) => unknown;

export interface LocateFaceOptions {
  readonly load?: TasksVisionLoader;
  readonly toSource?: ImageSourceFactory;
}
