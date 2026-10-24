/**
 * Background removal feature barrel. No React and no knowledge of the host app.
 *
 *   matte          read the model's matte from either result shape (pure)
 *   cutOut         keep/remove decisions on the reference 128 grid (pure)
 *   subjectAlpha   full-resolution soft alpha gated by the tuned grid (pure)
 *   segmentSubject thin, cached, never-throwing Transformers.js loader
 */
export type {
  CutOutTuning,
  DecisionGrid,
  PixelPlane,
  SegmentationPipeline,
  SubjectMatte,
  TransformersLoader,
  TransformersModule,
  TuningKnob,
} from './types';
export { alphaOf, planeOf } from './matte';
export {
  CUT_OUT_STEPS,
  DECISION_GRID,
  DEFAULT_TUNING,
  TUNING_BOUNDS,
  componentSizesOf,
  gridFromMatte,
  keepEverything,
  pruneIslands,
  trimEdge,
  tunedGrid,
  withBackground,
  withKnob,
} from './cutOut';
export { subjectAlpha, type SubjectAlphaInput } from './subjectAlpha';
/** Deterministic synthetic scene for consumers' tests (ADDENDUM-017 §5); no binary fixtures. */
export { FACE_DISC, HAWKER_CROP, HAWKER_HEIGHT, HAWKER_WIDTH, SECOND_HEAD, buildHawkerFrame, buildHawkerMatte } from './fixtures';
export {
  SEGMENTATION_MODEL,
  TRANSFORMERS_URL,
  forgetSegmenter,
  loadTransformers,
  segmentSubject,
  warmUpSegmenter,
} from './segmentSubject';
