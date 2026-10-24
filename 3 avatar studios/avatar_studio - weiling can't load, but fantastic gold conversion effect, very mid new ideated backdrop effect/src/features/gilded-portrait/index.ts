/**
 * Gilded Portrait feature barrel. Hosts import its supported API from here.
 *
 * Layers (pure -> DOM):
 *   tone / curve / goldRamp / mask / fit / validate  deterministic image math and contracts
 *   pipeline / presets                              immutable image transformation
 *   load / export                                   browser file and PNG adapters
 *   useGildedPortrait                               state, preset decisions, and export flow
 *   GildedPortraitCanvas                            thin canvas and preview sheen
 *   GildedPortraitModal / GildedPortraitLauncher    opt-in interaction surface
 */

export type {
  AlphaMask,
  BackdropId,
  CurvePoint,
  FaceBox,
  FaceDetection,
  FaceDetectionSource,
  GoldRampDefinition,
  GoldRampId,
  GoldRampStop,
  GildingMaskParams,
  GildingParams,
  GildingPreset,
  LevelsSettings,
  MaskShape,
  PortraitAnalysisStatus,
  RgbaImage,
  SubjectMask,
} from './types';
export type { BlurOptions, ClarityOptions } from './tone';
export type { ShapeMaskOptions } from './mask';
export type { FittedSize } from './fit';
export type { ImageFileMetadata, ImageFileValidation } from './validate';
export { toLuminance, applyLevels, applyClarity, boxBlur } from './tone';
export { buildCurveLut, foldTone, buildFoldLut } from './curve';
export { GOLD_RAMPS, buildGoldRampLut } from './goldRamp';
export { buildShapeMask, chokeMask } from './mask';
export { fitWithin } from './fit';
export { GILDING_PRESETS } from './presets';
export { ART_BACKDROPS, buildArtBackdrop, compositeImages } from './artBackdrop';
export { clampFaceBox, selectLargestFace, detectPortraitFace, warmUpFaceDetector } from './faceDetection';
export { applySubjectMask, estimateSubjectMask, sampleMask } from './subjectMask';
export { segmentPortraitSubject } from './subjectSegmentation';
export { buildGildingToneLut, gildImage } from './pipeline';
export { MAX_IMAGE_FILE_SIZE, validateImageFile } from './validate';
export { MAX_GILDED_IMAGE_EDGE, loadRgbaImage } from './load';
export { downloadGildedPng } from './export';
export { useGildedPortrait } from './useGildedPortrait';
export { GildedPortraitCanvas } from './GildedPortraitCanvas';
export { GildedPortraitModal } from './GildedPortraitModal';
export { GildedPortraitLauncher } from './GildedPortraitLauncher';