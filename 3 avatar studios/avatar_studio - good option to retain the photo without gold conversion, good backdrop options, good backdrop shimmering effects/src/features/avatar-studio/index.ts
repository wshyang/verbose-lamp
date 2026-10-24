/**
 * Gold Avatar Studio feature barrel (ported from the reference app's avatar studio).
 *
 * Layers (pure -> DOM):
 *   model/  sprite, cropBox, matte, goldBackdrop, compose   deterministic, unit-tested
 *   engine/ faceLocator, segmenter (CDN, never throw), prepareSubject orchestration
 *   hooks/  useShimmerFrames (pixels), useAvatarStudio (state + decisions)
 *   components/ ShimmerCanvas, controls, modal, launchers
 */
export type {
  AvatarSubject, BackdropPatternId, BackdropStyle, CropBox, EnamelPaletteId, FaceDetection, MatteTuning, SubjectFinish,
} from './model/types';
export { parseIndexedSprite, spriteToImage, spriteToMatte } from './model/sprite';
export { cropFromFace, cropImage, cropMatte, centreSquare, largestFace } from './model/cropBox';
export { DEFAULT_MATTE_TUNING, refineMatte, keepSeedPiece, planeOf, alphaOf } from './model/matte';
export { renderGoldBackdrop } from './model/goldBackdrop';
export { composeAvatar, finishSubject, haloOf } from './model/compose';
export { ENAMEL_PALETTES, PATTERN_OPTIONS, DEFAULT_BACKDROP_STYLE } from './data/backdropStyles';
export { WEI_LING_AVATAR } from './data/weiLing';
export { locateFace, warmUpFaceLocator } from './engine/faceLocator';
export { segmentSubject, warmUpSegmenter } from './engine/segmenter';
export { preparePhotoSubject, subjectFromSprite, STUDIO_SIDE } from './engine/prepareSubject';
export type { SubjectEngines, PreparedSubject } from './engine/prepareSubject';
export { useAvatarStudio } from './hooks/useAvatarStudio';
export { useShimmerFrames } from './hooks/useShimmerFrames';
export { ShimmerCanvas } from './components/ShimmerCanvas';
export { AvatarStudioModal } from './components/AvatarStudioModal';
export { AvatarStudioLauncher, WeiLingAvatarButton } from './components/AvatarStudioLauncher';
