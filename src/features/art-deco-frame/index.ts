export * from './engine/frameGrammar';
export * from './engine/frameGrammar/genome';
export type { FrameArchetype } from './model/types';
export {
  createChamferedFrameGeometry,
  toneAngleFor,
} from './render/railGeometry';
export {
  createScreenBorderRig,
  type ScreenBorderRig,
} from './render/ScreenBorderRig';
export {
  applyFinish,
  createGoldFrameMaterial,
  createGoldFrameUniforms,
  finishForFormula,
  type FrameFinish,
  type GoldFrameMaterialOptions,
  type GoldFrameUniforms,
} from './render/frameMaterial';
export {
  createExtrudedDecoTextMesh,
  type DecoTextOptions,
  type DecoTextRig,
} from './render/decoTypography';