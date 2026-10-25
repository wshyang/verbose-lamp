import type {
  FrameLayerSource,
  FrameSource,
  FrameSourceInfo,
  FrameSurface,
  GeneKey,
  IntricacyPreset,
  ScreenBorderPattern,
} from '@/features/art-deco-frame';

export interface FrameStudioControlProps {
  isOpen: boolean;
  surface: FrameSurface;
  patterns: readonly FrameSourceInfo[];
  baseSource: FrameSource;
  layers: readonly {
    source: FrameLayerSource;
    label: string;
    blurb: string;
    enabled: boolean;
    level: number;
  }[];
  designGallery: readonly { index: number; label: string; kind: string }[];
  activeDesignIndex: number | null;
  designLabel: string;
  level: number;
  detailPercent: number;
  detailPresets: readonly IntricacyPreset[];
  activePreset: IntricacyPreset | null;
  isDesignPattern: boolean;
  proportionsOpen: boolean;
  genome: Record<GeneKey, number>;
  borderEnabled: boolean;
  borderPattern: ScreenBorderPattern;
  borderWeight: number;
  onSurfaceChange: (surface: FrameSurface) => void;
  onPatternChange: (source: FrameSource) => void;
  /** Reroll the seeded Deco Lattice pattern (ADDENDUM-021 §3.5). */
  onRerollPattern: () => void;
  onLayerToggle: (source: FrameLayerSource, enabled: boolean) => void;
  onLayerLevelChange: (source: FrameLayerSource, level: number) => void;
  onDesignChange: (index: number) => void;
  onLevelChange: (level: number) => void;
  onDetailChange: (percent: number) => void;
  onProportionsToggle: (open: boolean) => void;
  onGeneChange: (key: GeneKey, value: number) => void;
  onBorderEnabledChange: (enabled: boolean) => void;
  onBorderPatternChange: (pattern: ScreenBorderPattern) => void;
  onRerollBorder: () => void;
  onBorderWeightChange: (weight: number) => void;
  onReset: () => void;
  onDismiss: () => void;
}
