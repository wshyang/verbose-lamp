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
  | 'arch';

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

export type FrameSource = 'authored' | 'fractal' | 'rosette' | 'arcade';

export interface FrameFormula {
  source: FrameSource;
  /** Recursion depth / form exponent, 1..4. Ignored by `authored` (fixed shape). */
  level: number;
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
] as const;

export const DEFAULT_FRAME_FORMULA: FrameFormula = { source: 'authored', level: 2 };

export interface FrameStyle {
  intricacy: Intricacy;
  formula: FrameFormula;
}

export const DEFAULT_FRAME_STYLE: FrameStyle = {
  intricacy: FILM_BASELINE_INTRICACY,
  formula: DEFAULT_FRAME_FORMULA,
};

export interface PosterBorderStyle {
  level: number;
  intricacy: Intricacy;
}

export const DEFAULT_POSTER_BORDER_STYLE: PosterBorderStyle = {
  level: 2,
  intricacy: FILM_BASELINE_INTRICACY,
};

export type FrameSurface = 'title-cards' | 'poster-edges';
