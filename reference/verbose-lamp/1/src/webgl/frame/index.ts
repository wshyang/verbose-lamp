export {
  buildFrameGeometry,
  clampIntricacy,
  isSignatureIntricacy,
  classifyRoles,
  simplifySignature,
  planDerivation,
  reducePlan,
  fitDerivedToBudget,
  buildEchoLayers,
  buildBandCompanions,
  buildRosettes,
  estimateVertexCount,
  polylineLength,
  centroidAbsX,
} from './derive';

export type { DerivationPlan } from './derive';

export {
  SIGNATURE_GENOME,
  GENE_ORDER,
  GENE_DEFINITIONS,
  EXPLORER_PHI,
  clampGene,
  clampGenome,
  isSignatureGenome,
  withGene,
  variantCoordinates,
  genomeForVariant,
  nextVariantIndex,
} from './genome';

export type { BaseGenome, GeneKey, GeneDefinition } from './genome';

export { buildBaseOrnaments, interpretMotif } from './interpret';
export { recipeFor, monogramLetterPaths } from './recipes';
export {
  buildEdgeBorder,
  viewportScaleAtDistance,
} from './edgeBorder';
export { posterRecipeFor } from './posterRecipes';
export {
  emitRadialFan,
  emitFlutedPilaster,
  emitSkylineComb,
  emitRing,
  resolveFanGrid,
  mirrorSpec,
  mirroredPair,
} from './posterMotifs';
export { aggregateFrameStats, emptyFrameStats } from './stats';
export {
  cantorIntervals,
  childDiamonds,
  twoAdicValuation,
  MIN_CANTOR_SEGMENT,
  MIN_DIAMOND_RADIUS,
  MIN_RAY_LENGTH,
} from './fractals';

export {
  SIGNATURE_INTRICACY,
  SAFE_FRAME_EXTENT,
  SAFE_FRAME_EXTENT_Y,
  MAX_FRAME_EXTENT,
  MAX_FRAME_RAILS,
  MAX_BASE_RAILS,
  MAX_FRAME_VERTICES,
} from './types';

export type {
  FrameFamily,
  FrameGeometry,
  FrameGeometryRequest,
  FrameGeometryStats,
  FrameRole,
  FrameSpec,
  FrameStyle,
  Point2,
} from './types';

export type {
  Motif,
  CutOctagonMotif,
  ZigguratMotif,
  DiamondMotif,
  SunburstMotif,
  SplitRuleMotif,
  ChevronWingsMotif,
  RadialFanMotif,
  FlutedPilasterMotif,
  SkylineCombMotif,
  RingMotif,
  PathMotif,
} from './motifs';
