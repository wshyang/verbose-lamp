import { BaseGenome, SIGNATURE_GENOME } from './genome';

export interface Point2 {
  x: number;
  y: number;
}

/**
 * Semantic kind of a rail. Set by whichever primitive produced it; drives the
 * reduce/elaborate grammar (ADDENDUM-002 §2.2–2.3). Never typed by hand per call.
 */
export type RailKind =
  | 'frame'
  | 'monogram'
  | 'pinstripe'
  | 'rule'
  | 'diamond'
  | 'column'
  | 'chevron'
  | 'ray'
  | 'arch'
  // Deco Lattice kinds (ADDENDUM-021 §3.2): octagram, bundle fill, reed ticks.
  | 'star'
  | 'lattice'
  | 'reed';

export interface PolylineSpec {
  points: Point2[];
  closed?: boolean;
  width: number;
  depth: number;
  z: number;
  delay: number; // 0..0.65 stagger
  partDir?: number; // -1 left, +1 right, 0 auto-by-x
  kind?: RailKind;
  /** Derived importance 0 (essential) .. 3 (flourish). Computed by annotateRanks(). */
  rank?: number;
}

/** Intricacy scalar k in [0, 1]. 0.5 is the Film Baseline (identity). */
export type Intricacy = number;

export const FILM_BASELINE_INTRICACY: Intricacy = 0.5;

export interface IntricacyPreset {
  id: string;
  label: string;
  value: Intricacy;
}

export const INTRICACY_PRESETS: readonly IntricacyPreset[] = [
  { id: 'minimal', label: 'Minimal', value: 0.0 },
  { id: 'restrained', label: 'Restrained', value: 0.25 },
  { id: 'baseline', label: 'Film Baseline', value: 0.5 },
  { id: 'ornate', label: 'Ornate', value: 0.75 },
  { id: 'baroque', label: 'Baroque', value: 1.0 },
] as const;

/* -------------------------------------------------------------------------- */
/*  FRAME GENESIS (ADDENDUM-004): the rule that draws the base rails           */
/* -------------------------------------------------------------------------- */

export type FrameSource = 'authored' | 'fractal' | 'rosette' | 'arcade' | 'lattice';
export type FrameLayerSource = Exclude<FrameSource, 'authored'>;
export type FrameSurface = 'title-cards' | 'screen-border';

export interface FramePatternLayer {
  source: FrameLayerSource;
  enabled: boolean;
  level: number;
}

export interface FrameFormula {
  /** The foundation pattern. Authored remains the unchanged, tunable default. */
  source: FrameSource;
  /** Recursion depth / form exponent, 1..4. Ignored by `authored` (fixed shape). */
  level: number;
  /** Seed for seeded sources (`lattice` walks). Default 1925 (ADDENDUM-021 §3.5). */
  seed?: number;
  /** Proportion genes; the signature genome reproduces the delivered frame. */
  genome: BaseGenome;
  /** Optional decorative patterns composited over the foundation. */
  layers?: readonly FramePatternLayer[];
}

export interface FrameSourceInfo {
  id: FrameSource;
  label: string;
  blurb: string;
  isGenerative: boolean;
}

export const GENESIS_LEVEL_MIN = 1;
export const GENESIS_LEVEL_MAX = 4;

export const FRAME_SOURCES: readonly FrameSourceInfo[] = [
  {
    id: 'authored',
    label: 'Authored',
    blurb: 'The delivered frame: hand-laid octagons, ziggurats, fans and diamonds.',
    isGenerative: false,
  },
  {
    id: 'fractal',
    label: 'Fractal',
    blurb: 'Cantor-cut rails on golden-ratio inset rings; self-similar at every level.',
    isGenerative: true,
  },
  {
    id: 'rosette',
    label: 'Rosette',
    blurb: 'Superellipse cartouche modulated by a harmonic rose, with radial spokes.',
    isGenerative: true,
  },
  {
    id: 'arcade',
    label: 'Arcade',
    blurb: 'Recursive bays of stepped arches between piers, each level nested inward.',
    isGenerative: true,
  },
  {
    id: 'lattice',
    label: 'Deco Lattice',
    blurb: "The film's parallel-line bundles on a 45° lattice, generated from rules and a seed.",
    isGenerative: true,
  },
] as const;

export const FRAME_LAYER_SOURCES: readonly (FrameSourceInfo & { id: FrameLayerSource })[] = Object.freeze(
  FRAME_SOURCES.filter(
    (pattern): pattern is FrameSourceInfo & { id: FrameLayerSource } => pattern.id !== 'authored'
  )
);

export const DEFAULT_FRAME_LAYERS: readonly FramePatternLayer[] = [
  { source: 'fractal', enabled: false, level: 2 },
  { source: 'rosette', enabled: false, level: 2 },
  { source: 'arcade', enabled: false, level: 2 },
  { source: 'lattice', enabled: false, level: 2 },
] as const;

export const DEFAULT_FRAME_FORMULA: FrameFormula = {
  source: 'authored',
  level: 2,
  genome: { ...SIGNATURE_GENOME },
  layers: DEFAULT_FRAME_LAYERS,
};

export interface FrameStyle {
  intricacy: Intricacy;
  formula: FrameFormula;
}

export const DEFAULT_FRAME_STYLE: FrameStyle = {
  intricacy: FILM_BASELINE_INTRICACY,
  formula: DEFAULT_FRAME_FORMULA,
};

export type ScreenBorderPattern = 'poster' | 'lattice';

export interface ScreenBorderStyle {
  /** 0..1 — how many nested rules and how dense the reeding */
  weight: number;
  /** proportion genes shared with the title frame */
  genome: BaseGenome;
  /** Border family. Default 'poster' (the delivered geometry); 'lattice' is ADDENDUM-021. */
  pattern?: ScreenBorderPattern;
  /** Seed for the lattice border's walks. Default 1925. */
  seed?: number;
}

export const DEFAULT_SCREEN_BORDER_STYLE: ScreenBorderStyle = {
  weight: 0.5,
  genome: { ...SIGNATURE_GENOME },
  pattern: 'poster',
};

