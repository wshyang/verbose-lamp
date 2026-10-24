import type { FrameArchetype } from '../../types/sequence';
import type { BaseGenome } from './genome';
import type { Motif, SplitRuleMotif, SunburstMotif } from './motifs';
import {
  emitChevronWings,
  emitCutOctagon,
  emitDiamond,
  emitSplitRule,
  emitSunburst,
  emitZiggurat,
  resolveFan,
} from './primitives';
import { emitFlutedPilaster, emitRadialFan, emitRing, emitSkylineComb } from './posterMotifs';
import { cantorRule, refineSunburst, sproutDiamondTree } from './fractals';
import { recipeFor } from './recipes';
import { posterRecipeFor } from './posterRecipes';
import type { FrameFamily, FrameRole, FrameSpec } from './types';

export interface BaseOrnamentRequest {
  archetype: FrameArchetype;
  mainWidth: number;
  genome: BaseGenome;
  family?: FrameFamily;
}

function withRole(specs: FrameSpec[], role: FrameRole | undefined): FrameSpec[] {
  return specs.map((spec) => ({ ...spec, role: spec.role ?? role ?? 'ornament' }));
}

function interpretSunburst(motif: SunburstMotif, genome: BaseGenome): FrameSpec[] {
  const fan = resolveFan(motif, genome);
  return [...withRole(emitSunburst(motif, fan), 'ornament'), ...refineSunburst(motif, fan, genome)];
}

function interpretSplitRule(motif: SplitRuleMotif, genome: BaseGenome): FrameSpec[] {
  return cantorRule(motif, genome) ?? withRole(emitSplitRule(motif), 'ornament');
}

/** One motif → rails under the genome. Recursive children carry role 'fractal'. */
export function interpretMotif(motif: Motif, genome: BaseGenome): FrameSpec[] {
  switch (motif.kind) {
    case 'cutOctagon':
      return withRole(emitCutOctagon(motif, genome), motif.role);
    case 'ziggurat':
      return withRole(emitZiggurat(motif, genome), motif.role);
    case 'diamond':
      return [...withRole([emitDiamond(motif)], 'ornament'), ...sproutDiamondTree(motif, genome)];
    case 'sunburst':
      return interpretSunburst(motif, genome);
    case 'splitRule':
      return interpretSplitRule(motif, genome);
    case 'chevronWings':
      return withRole(emitChevronWings(motif, genome), 'ornament');
    case 'radialFan':
      return withRole(emitRadialFan(motif, genome), 'ornament');
    case 'flutedPilaster':
      return withRole(emitFlutedPilaster(motif, genome), 'ornament');
    case 'skylineComb':
      return withRole(emitSkylineComb(motif, genome), 'ornament');
    case 'ring':
      return withRole(emitRing(motif), 'ornament');
    case 'path':
      return [{ ...motif.spec, role: motif.spec.role ?? 'ornament' }];
  }
}

function recipeForFamily(request: BaseOrnamentRequest): Motif[] {
  return request.family === 'poster'
    ? posterRecipeFor(request.archetype, request.mainWidth)
    : recipeFor(request.archetype, request.mainWidth);
}

/** Base_G(Recipe_F,act(textWidth)): the architecture before ornament layering. */
export function buildBaseOrnaments(request: BaseOrnamentRequest): FrameSpec[] {
  return recipeForFamily(request).flatMap((motif) => interpretMotif(motif, request.genome));
}
