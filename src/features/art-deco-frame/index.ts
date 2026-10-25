export * from './engine/frameGrammar';
export * from './engine/frameGrammar/genome';
export type { FrameArchetype } from './model/types';
export {
  createChamferedFrameGeometry,
} from './render/railGeometry';
export {
  createScreenBorderRig,
  finishFor,
  type ScreenBorderRig,
} from './render/ScreenBorderRig';
export {
  createGoldFrameMaterial,
  createGoldFrameUniforms,
  frameMaterialCacheKey,
  FRAME_FINISHES,
  type FrameFinish,
  type GoldFrameMaterialOptions,
  type GoldFrameUniforms,
} from './render/frameMaterial';
export {
  createExtrudedDecoTextMesh,
  type DecoTextOptions,
  type DecoTextRig,
} from './render/decoTypography';