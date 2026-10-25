import { DEFAULT_FRAME_LAYERS, type FrameFormula, type FrameLayerSource, type FramePatternLayer } from '@/features/art-deco-frame';

/** The sequence's layer settings, defaulting to the house set for older formulas. */
export function layerSettingsOf(formula: FrameFormula): readonly FramePatternLayer[] {
  return formula.layers ?? DEFAULT_FRAME_LAYERS;
}

export interface LayerView {
  readonly source: FrameLayerSource;
  readonly enabled: boolean;
  readonly level: number;
}

/** One layer row for the panel: a source with no saved setting shows its defaults. */
export function layerViewOf(settings: readonly FramePatternLayer[], source: FrameLayerSource): LayerView {
  const layer = settings.find((entry) => entry.source === source);
  return { source, enabled: layer?.enabled ?? false, level: layer?.level ?? 2 };
}
