import { useMemo } from 'react';
import { FRAME_SOURCES, INTRICACY_PRESETS } from '@/features/art-deco-frame';
import { DESIGN_GALLERY } from '../data/frameDesigns';
import {
  activePresetOf,
  designEntryOf,
  designLabelOf,
  detailPercent,
  layerOptionsOf,
  type FrameDraft,
} from '../model/frameDraft';

/**
 * Everything the panel *reads*, derived from state (ADDENDUM-037). Memoised per
 * input so a keystroke in an unrelated field does not rebuild the layer list.
 */
export function useStudioView(draft: FrameDraft) {
  const { formula } = draft;

  const activeDesign = useMemo(() => designEntryOf(formula), [formula]);
  const activePreset = useMemo(() => activePresetOf(draft.intricacy), [draft.intricacy]);
  const layers = useMemo(() => layerOptionsOf(formula), [formula]);

  return {
    patterns: FRAME_SOURCES,
    layers,
    designGallery: DESIGN_GALLERY,
    activeDesignIndex: activeDesign?.index ?? null,
    activePreset,
    designLabel: designLabelOf(formula),
    detailPercent: detailPercent(draft.intricacy),
    detailPresets: INTRICACY_PRESETS,
    isDesignPattern: formula.source === 'authored',
  };
}
