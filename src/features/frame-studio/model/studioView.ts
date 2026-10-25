import {
  FRAME_SOURCES,
  INTRICACY_PRESETS,
  type FrameFormula,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';
import { DESIGN_GALLERY, describeDesign, findDesignEntry } from '../data/frameDesigns';
import { detailPercent, layerOptionsFor, presetForIntricacy } from './studioFormula';

/** Everything the title-card panel reads, derived from the formula and intricacy and nothing else. */
export function sequenceView(formula: FrameFormula, intricacy: number) {
  const activeDesign = formula.source === 'authored' ? (findDesignEntry(formula.genome) ?? undefined) : undefined;
  return {
    genome: formula.genome,
    patterns: FRAME_SOURCES,
    baseSource: formula.source,
    layers: layerOptionsFor(formula),
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: activeDesign?.index ?? null,
    designLabel: describeDesign(activeDesign, formula.genome),
    level: formula.level,
    detailPercent: detailPercent(intricacy),
    detailPresets: INTRICACY_PRESETS,
    activePreset: presetForIntricacy(intricacy),
    isDesignPattern: formula.source === 'authored',
  };
}

/** Everything the screen-border panel reads. */
export function borderView(border: ScreenBorderStyle) {
  return {
    genome: border.genome,
    borderPattern: border.pattern ?? 'poster',
    borderWeight: detailPercent(border.weight),
  };
}
