/**
 * Face detection feature barrel. No React and no knowledge of the host app: any surface
 * that needs "where is the face, and what square frames it" can import this alone.
 *
 *   framing      pure crop math from a detection (tested)
 *   locateFace   thin, cached, never-throwing MediaPipe loader
 */
export type {
  FaceBoundingBox,
  FaceDetection,
  FaceDetector,
  FaceKeypoint,
  ImageSourceFactory,
  LocateFaceOptions,
  TasksVisionLoader,
  TasksVisionModule,
} from './types';
export { CROP_PER_INTER_OCULAR, EYE_LINE, HEAD_OVER_FACE, HEAD_SHARE, cropFromDetection, largestFace } from './framing';
export {
  MIN_CONFIDENCE,
  MODEL_URL,
  TASKS_VISION_URL,
  canvasSourceOf,
  forgetFaceLocator,
  loadTasksVision,
  locateFace,
  warmUpFaceLocator,
} from './locateFace';
