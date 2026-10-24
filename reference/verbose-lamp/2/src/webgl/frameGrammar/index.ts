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

export * from './types';
export { buildCoreFrameSpecs } from './archetypes';
export { buildPosterBorderSpecs, posterFanDirection } from './posterBorder';
export {
  buildGenerativeFrameSpecs,
  cantorSegments,
  frameBox,
  mirrorHalves,
} from './generative';
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
      ? buildCoreFrameSpecs(archetype, mainWidth)
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
