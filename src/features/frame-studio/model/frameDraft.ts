import {
  DEFAULT_FRAME_LAYERS,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FRAME_LAYER_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
  clampGenome,
  withGene as genomeWithGene,
  type FrameFormula,
  type FrameLayerSource,
  type FramePatternLayer,
  type FrameSource,
  type FrameStyle,
  type GeneKey,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { describeDesign, designAt, findDesignEntry } from '../data/frameDesigns';
import { layerSettingsOf, layerViewOf } from './layerView';

/** The two halves of the sequence frame that commit together. */
export interface FrameDraft {
  formula: FrameFormula;
  intricacy: number;
}

/** A layer edit, as the panel sends it. */
export interface LayerChanges {
  enabled?: boolean;
  level?: number;
}

export const FRAME_LEVEL_MIN = 1;
export const FRAME_LEVEL_MAX = 4;

export const detailPercent = (value: number) => Math.round(value * 100);
export const detailValue = (percent: number) => Math.min(1, Math.max(0, percent / 100));
export const clampLayerLevel = (level: number) => Math.min(FRAME_LEVEL_MAX, Math.max(FRAME_LEVEL_MIN, Math.round(level)));

/** The delivered frame: signature genome, default layers, no overlays enabled. */
export function defaultFrameFormula(): FrameFormula {
  return {
    ...DEFAULT_FRAME_STYLE.formula,
    genome: { ...SIGNATURE_GENOME },
    layers: DEFAULT_FRAME_LAYERS.map((layer) => ({ ...layer })),
  };
}

export function defaultBorderStyle(): ScreenBorderStyle {
  return { ...DEFAULT_SCREEN_BORDER_STYLE, genome: { ...SIGNATURE_GENOME } };
}

export function initialDraft(): FrameDraft {
  return { formula: defaultFrameFormula(), intricacy: DEFAULT_FRAME_STYLE.intricacy };
}

/** What the renderer is told on every sequence commit. */
export function sequenceStyleOf(draft: FrameDraft): FrameStyle {
  return { intricacy: draft.intricacy, formula: draft.formula };
}

/** Picks a foundation pattern, and turns the matching overlay layer back off. */
export function withPattern(draft: FrameDraft, source: FrameSource): FrameDraft {
  const layers = layerSettingsOf(draft.formula).map((layer) =>
    layer.source === source ? { ...layer, enabled: false } : layer
  );
  const level = source === 'authored' ? DEFAULT_FRAME_STYLE.formula.level : draft.formula.level;
  return { ...draft, formula: { ...draft.formula, source, level, layers } };
}

/** Applies a gallery design's genome, clamped so hand-edited values stay legal. */
export function withDesign(draft: FrameDraft, index: number): FrameDraft {
  const entry = designAt(index);
  return { ...draft, formula: { ...draft.formula, genome: clampGenome(entry.genome) } };
}

export function withGene(draft: FrameDraft, key: GeneKey, value: number): FrameDraft {
  return { ...draft, formula: { ...draft.formula, genome: genomeWithGene(draft.formula.genome, key, value) } };
}

export function withLayer(draft: FrameDraft, source: FrameLayerSource, changes: LayerChanges): FrameDraft {
  const layers = layerSettingsOf(draft.formula).map((layer) =>
    layer.source === source ? { ...layer, ...changes } : layer
  );
  return { ...draft, formula: { ...draft.formula, layers } };
}

export function withLevel(draft: FrameDraft, level: number): FrameDraft {
  return { ...draft, formula: { ...draft.formula, level } };
}

export function withDetail(draft: FrameDraft, percent: number): FrameDraft {
  return { ...draft, intricacy: detailValue(percent) };
}

export function withBorderWeight(border: ScreenBorderStyle, percent: number): ScreenBorderStyle {
  return { ...border, weight: detailValue(percent) };
}

export function withBorderGene(border: ScreenBorderStyle, key: GeneKey, value: number): ScreenBorderStyle {
  return { ...border, genome: genomeWithGene(border.genome, key, value) };
}

/** One row per overlay source that is not the current foundation. */
export function layerOptionsOf(formula: FrameFormula) {
  const settings = layerSettingsOf(formula);
  return FRAME_LAYER_SOURCES.filter((pattern) => pattern.id !== formula.source).map((pattern) => ({
    ...layerViewOf(settings, pattern.id),
    label: pattern.label,
    blurb: pattern.blurb,
  }));
}

/** The gallery entry the current genome matches, if any. */
export function designEntryOf(formula: FrameFormula) {
  if (formula.source !== 'authored') return undefined;
  return findDesignEntry(formula.genome) ?? undefined;
}

export function designLabelOf(formula: FrameFormula): string {
  return describeDesign(designEntryOf(formula), formula.genome);
}

/** The named intricacy preset the current value sits on, or `null` between them. */
export function activePresetOf(intricacy: number) {
  return INTRICACY_PRESETS.find((preset) => detailPercent(preset.value) === detailPercent(intricacy)) ?? null;
}

export type { FramePatternLayer };
