/**
 * Gilded Avatar Studio barrel (ADDENDUM-017/018). Composes face detection, background
 * removal, the enamel backdrop and the gilded-portrait pipeline into a framed avatar.
 *
 *   compose / frame / stage / cropBox   pure, tested composition and session rules
 *   data/samples                        bundled demo portraits (Wei_Ling)
 *   hooks                               session, look and studio decisions (no JSX)
 *   components                          thin gold UI; launcher for hosts
 */
export type {
  AvatarComposition,
  AvatarFrame,
  AvatarSample,
  BackdropLayer,
  ComposedAvatar,
  LayerComposition,
  StageFacts,
  StudioStage,
  SubjectFinish,
  SubjectInput,
  SubjectLayer,
} from './types';
export { AVATAR_SIZE, composeAvatar, composeLayers, cutOutSubject, emptySubject, outlineRing, subjectGildingParams } from './compose';
export { framePaintAt, type FramePaint } from './frame';
export { SHIMMER_FRAMES, glintProfile, shimmerFrame, shimmerFrames } from './shimmer';
export { GILDING_TONE_RANGES, gildingSliderValue, withGildingTone, type GildingToneKey, type GildingToneRange } from './gilding';
export { useShimmerFrames } from './hooks/useShimmerFrames';
export { ShimmerCanvas } from './components/ShimmerCanvas';
export { STAGE_HINTS, isStageBusy, nextStage, stageHint } from './stage';
export { boxToPhoto, clampBox, moveBox, photoToBox, resizeBox, startingBox } from './cropBox';
export { AVATAR_SAMPLES, WEI_LING } from './data/samples';
export { usePhotoSession, type CutOutAvailability, type PhotoSession } from './hooks/usePhotoSession';
export { useAvatarLook, type AvatarLook } from './hooks/useAvatarLook';
export { useAvatarStudio, type AvatarStudioState } from './hooks/useAvatarStudio';
export { useCropper } from './hooks/useCropper';
export { PhotoCropper } from './components/PhotoCropper';
export { AvatarStudioModal } from './components/AvatarStudioModal';
export { AvatarStudioLauncher } from './components/AvatarStudioLauncher';
