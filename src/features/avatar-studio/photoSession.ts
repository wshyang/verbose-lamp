import type { SubjectMatte } from '@/features/background-removal';
import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import { startingBox } from './cropBox';
import { nextStage, stageHint } from './stage';
import type { StudioStage } from './types';

/** What the photo session knows. Everything the panel shows is derived from it (`viewOf`). */
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
  photo: null, photoName: '', crop: null, foundCrop: null, matte: null, isLocating: false, isSegmenting: false, error: null,
});

export type CutOutAvailability = 'available' | 'pending' | 'unavailable';

export interface SessionView {
  readonly stage: StudioStage;
  readonly hint: string;
  readonly isCropping: boolean;
  readonly cropperStart: SquareBox | null;
  readonly cutOut: CutOutAvailability;
}

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'That image could not be opened.';

function cutOutOf(state: SessionState): CutOutAvailability {
  if (state.photo === null) return 'available';
  if (state.isSegmenting) return 'pending';
  return state.matte === null ? 'unavailable' : 'available';
}

/** The stage, hint and cropper state for a session. `isAdjusting` is the user's request to move the square. */
export function viewOf(state: SessionState, isAdjusting: boolean): SessionView {
  const stage = nextStage({ hasImage: state.photo !== null, ...state });
  return {
    stage,
    hint: stageHint(stage),
    isCropping: state.photo !== null && (stage === 'cropping' || (isAdjusting && !state.isLocating)),
    cropperStart: state.photo === null ? null : state.crop ?? state.foundCrop ?? startingBox(state.photo),
    cutOut: cutOutOf(state),
  };
}
