/**
 * Gold Avatar Studio feature barrel. Hosts import its supported API from here.
 *
 * Layers (pure -> DOM):
 *   spriteCodec / faceCrop / matte / portraitGrid / backdropArt / goldStudio
 *                                            deterministic image math and contracts
 *   faceDetection / subjectSegmentation       browser adapters: models over the network
 *   artPalettes / weiLingSprite               the studio's data
 *   useAvatarStudio                           state and decisions
 *   AvatarStudioCanvas / Modal / Launcher     the opt-in interaction surface
 */

export type {
  AlphaMask,
  ArtPalette,
  BackdropPattern,
  BackdropPatternKind,
  CropBox,
  FaceReading,
  FaceStatus,
  GoldRampId,
  GoldStudioOptions,
  IndexedSprite,
  Point,
  PortraitGrid,
  RgbaImage,
  StudioSource,
} from './types';

export { ART_PALETTES, artPaletteById } from './data/artPalettes';
export { WEI_LING_LABEL, WEI_LING_SPRITE } from './data/weiLingSprite';

export { formatIndexedSprite, parseIndexedSprite } from './engine/spriteCodec';
export { cropBoxFromFace, skinCropBox } from './engine/faceCrop';
export { detectFace, warmUpFaceDetector } from './engine/faceDetection';
export { segmentSubject } from './engine/subjectSegmentation';
export {
  backgroundFromMatte,
  keepSubjectPiece,
  pruneIslands,
  trimEdge,
} from './engine/matte';
export { gridFromCrop, gridFromSprite, resizeGrid, PORTRAIT_GRID_SIZE } from './engine/portraitGrid';
export { bandIndexOf, DEFAULT_PATTERNS } from './engine/backdropArt';
export { renderGoldStudio } from './engine/goldStudio';

export { useAvatarStudio, type AvatarStudioState } from './hooks/useAvatarStudio';
export { AvatarStudioCanvas } from './components/AvatarStudioCanvas';
export { AvatarStudioModal } from './components/AvatarStudioModal';
export { AvatarStudioLauncher } from './components/AvatarStudioLauncher';
