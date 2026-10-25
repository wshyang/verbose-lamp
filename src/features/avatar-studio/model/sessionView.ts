import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import type { SubjectMatte } from '@/features/background-removal';
import { startingBox } from '../cropBox';
import { nextStage, stageHint } from '../stage';
import type { StudioStage } from '../types';

/**
 * What a photo session knows, with no behaviour attached (ADDENDUM-039). It lives
 * here rather than inside the hook so the derived view below can be tested as
 * plain data.
 */
export interface SessionState {
  readonly photo: RgbaImage | null;
  readonly photoName: string;
  readonly crop: SquareBox | null;
  readonly foundCrop: SquareBox | null;
  readonly matte: SubjectMatte | null;
  readonly isLocating: boolean;
  readonly isSegmenting: boolean;
  readonly error: string | null;
}

export const EMPTY_SESSION: SessionState = Object.freeze({
  photo: null,
  photoName: '',
  crop: null,
  foundCrop: null,
  matte: null,
  isLocating: false,
  isSegmenting: false,
  error: null,
});

export type CutOutAvailability = 'available' | 'pending' | 'unavailable';

/** Whether the background-removal controls can be offered, are running, or are refused. */
export function cutOutOf(state: SessionState): CutOutAvailability {
  if (state.photo === null) return 'available';
  if (state.isSegmenting) return 'pending';
  return state.matte === null ? 'unavailable' : 'available';
}

export interface SessionView {
  readonly stage: StudioStage;
  readonly hint: string;
  readonly isCropping: boolean;
  readonly cropperStart: SquareBox | null;
  readonly cutOut: CutOutAvailability;
}

/**
 * The session as the UI sees it: the stage machine, the hint, whether the cropper
 * is up, where it opens, and what the cut-out controls may do.
 *
 * `isAdjusting` re-opens the cropper on an already-cropped photo; it is ignored
 * while a face is still being located, because that search will move the square.
 */
export function sessionViewOf(state: SessionState, isAdjusting: boolean): SessionView {
  const stage = nextStage({ hasImage: state.photo !== null, ...state });
  const isCropping = state.photo !== null && (stage === 'cropping' || (isAdjusting && !state.isLocating));
  const cropperStart = state.photo === null ? null : state.crop ?? state.foundCrop ?? startingBox(state.photo);
  return { stage, hint: stageHint(stage), isCropping, cropperStart, cutOut: cutOutOf(state) };
}
