import {
  DEFAULT_FRAME_FORMULA,
  DEFAULT_FRAME_LAYERS,
  DEFAULT_FRAME_STYLE,
  DEFAULT_SCREEN_BORDER_STYLE,
  FRAME_LAYER_SOURCES,
  INTRICACY_PRESETS,
  SIGNATURE_GENOME,
  type FrameFormula,
  type FrameLayerSource,
  type FramePatternLayer,
  type FrameSource,
  type IntricacyPreset,
  type ScreenBorderStyle,
} from '@/features/art-deco-frame';

/**
 * Pure transforms behind the Frame Studio controls. The hooks decide when to commit; these decide
 * what the committed value is, so every rule here can be tested without rendering anything.
 */
export const detailPercent = (value: number): number => Math.round(value * 100);
export const detailValue = (percent: number): number => Math.min(1, Math.max(0, percent / 100));

export const defaultFrameFormula = (): FrameFormula => ({
  ...DEFAULT_FRAME_STYLE.formula,
  genome: { ...SIGNATURE_GENOME },
  layers: DEFAULT_FRAME_LAYERS.map((layer) => ({ ...layer })),
});

export const defaultBorderStyle = (): ScreenBorderStyle => ({
  ...DEFAULT_SCREEN_BORDER_STYLE,
  genome: { ...SIGNATURE_GENOME },
});

const layersOf = (formula: FrameFormula): readonly FramePatternLayer[] => formula.layers ?? DEFAULT_FRAME_LAYERS;

/** Choosing a foundation retires the layer that duplicated it; the authored frame restores its level. */
export function withFoundation(formula: FrameFormula, source: FrameSource): FrameFormula {
  const layers = layersOf(formula).map((layer) => (layer.source === source ? { ...layer, enabled: false } : layer));
  const level = source === 'authored' ? DEFAULT_FRAME_STYLE.formula.level : formula.level;
  return { ...formula, source, level, layers };
}

export function withLayerChanges(
  formula: FrameFormula,
  source: FrameLayerSource,
  changes: Partial<Pick<FramePatternLayer, 'enabled' | 'level'>>
): FrameFormula {
  const layers = layersOf(formula).map((layer) => (layer.source === source ? { ...layer, ...changes } : layer));
  return { ...formula, layers };
}

export interface LayerOption {
  readonly source: FrameLayerSource;
  readonly label: string;
  readonly blurb: string;
  readonly enabled: boolean;
  readonly level: number;
}

/** The composable layers, minus whichever one is already the foundation. */
export function layerOptionsFor(formula: FrameFormula): LayerOption[] {
  const settings = layersOf(formula);
  return FRAME_LAYER_SOURCES.filter((pattern) => pattern.id !== formula.source).map((pattern) => {
    const layer = settings.find((entry) => entry.source === pattern.id);
    return {
      source: pattern.id,
      label: pattern.label,
      blurb: pattern.blurb,
      enabled: layer?.enabled ?? false,
      level: layer?.level ?? DEFAULT_FRAME_FORMULA.level,
    };
  });
}

export function presetForIntricacy(intricacy: number): IntricacyPreset | null {
  return INTRICACY_PRESETS.find((preset) => detailPercent(preset.value) === detailPercent(intricacy)) ?? null;
}
