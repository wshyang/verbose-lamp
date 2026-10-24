import { FrameArchetype } from '../../types/sequence';
import { buildCoreFrameSpecs } from './archetypes';
import { buildGenerativeFrameSpecs } from './generative';
import { applyIntricacy } from './grammar';
import {
  DEFAULT_FRAME_FORMULA,
  FILM_BASELINE_INTRICACY,
  FrameFormula,
  Intricacy,
  PolylineSpec,
} from './types';
import type { BaseGenome } from './genome';

export * from './types';
export { buildCoreFrameSpecs } from './archetypes';
export {
  buildGenerativeFrameSpecs,
  cantorSegments,
  frameBox,
  mirrorHalves,
} from './generative';
export { buildEdgeBorder, viewportScaleAtDistance } from './edgeBorder';
export {
  annotateRanks,
  applyIntricacy,
  elaborate,
  elaborationGenerations,
  offsetPolylineOutward,
  rankBudget,
  reduceByRank,
} from './grammar';

export interface FrameRequest {
  archetype: FrameArchetype;
  mainWidth: number;
  intricacy?: Intricacy;
  formula?: FrameFormula;
}

/**
 * The full frame pipeline:
 *   genesis(archetype, width, formula) → annotate → reduce(k) → elaborate(k)
 * Default formula is `authored`, which reproduces the delivered frame exactly.
 */
export function buildFrame({
  archetype,
  mainWidth,
  intricacy = FILM_BASELINE_INTRICACY,
  formula = DEFAULT_FRAME_FORMULA,
}: FrameRequest): PolylineSpec[] {
  const core =
    formula.source === 'authored'
      ? buildCoreFrameSpecs(archetype, mainWidth, formula.genome)
      : buildGenerativeFrameSpecs(archetype, mainWidth, formula);
  return applyIntricacy(core, intricacy);
}

/** Back-compatible convenience wrapper (authored genesis). */
export function buildFrameSpecs(
  archetype: FrameArchetype,
  mainWidth: number,
  intricacy: Intricacy = FILM_BASELINE_INTRICACY
): PolylineSpec[] {
  return buildFrame({ archetype, mainWidth, intricacy });
}

/** Back-compatible authored wrapper accepting explicit proportion genes. */
export function buildAuthoredFrame(
  archetype: FrameArchetype,
  mainWidth: number,
  genome: BaseGenome,
  intricacy: Intricacy = FILM_BASELINE_INTRICACY
): PolylineSpec[] {
  return buildFrame({ archetype, mainWidth, intricacy, formula: { source: 'authored', level: 2, genome } });
}
