import {
  clampFormulaLevel,
  clampGenome,
  withGene,
  type FrameFormula,
  type FrameLayerSource,
  type FrameSource,
  type GeneKey,
  type ScreenBorderPattern,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { designAt } from '../data/frameDesigns';
import { nextPatternSeed } from './patternSeed';
import { detailValue, withFoundation, withLayerChanges } from './studioFormula';

/**
 * The edits each control makes, as closures over the current state. A hook memoises them per
 * state change; keeping them here means a control's rule is one line of plain code, not a hook.
 */
export type CommitSequence = (formula: FrameFormula, intricacy: number) => void;

export function sequenceActions(formula: FrameFormula, intricacy: number, commit: CommitSequence) {
  const edit = (next: FrameFormula) => commit(next, intricacy);
  return {
    selectPattern: (source: FrameSource) => edit(withFoundation(formula, source)),
    selectDesign: (index: number) => edit({ ...formula, genome: clampGenome(designAt(index).genome) }),
    setGene: (key: GeneKey, value: number) => edit({ ...formula, genome: withGene(formula.genome, key, value) }),
    setLayerEnabled: (source: FrameLayerSource, enabled: boolean) =>
      edit(withLayerChanges(formula, source, { enabled })),
    setLayerLevel: (source: FrameLayerSource, level: number) =>
      edit(withLayerChanges(formula, source, { level: clampFormulaLevel(level) })),
    setLevel: (level: number) => edit({ ...formula, level }),
    setDetail: (percent: number) => commit(formula, detailValue(percent)),
    /** A fresh lattice pattern from the next seed; the choreography is unchanged. */
    rerollPattern: () => edit({ ...formula, seed: nextPatternSeed(formula.seed) }),
  };
}

export function borderActions(border: ScreenBorderStyle, commit: (next: ScreenBorderStyle) => void) {
  return {
    setBorderPattern: (pattern: ScreenBorderPattern) => {
      if (pattern === (border.pattern ?? 'poster')) return;
      commit({ ...border, pattern });
    },
    /** A fresh proscenium seed; only the brass angles move. */
    rerollBorder: () => commit({ ...border, seed: nextPatternSeed(border.seed) }),
    setBorderWeight: (weight: number) => commit({ ...border, weight: detailValue(weight) }),
    setGene: (key: GeneKey, value: number) => commit({ ...border, genome: withGene(border.genome, key, value) }),
  };
}
