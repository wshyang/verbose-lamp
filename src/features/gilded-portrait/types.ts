import type { AlphaMask, RasterDimensions, RgbaImage } from '@/shared/lib/raster';

/**
 * Raster contracts moved to `src/shared/lib/raster` (ADDENDUM-017 §3.0). Re-exported so
 * this feature's public API, and every import of `./types`, stays unchanged.
 */
export type { AlphaMask, RasterDimensions, RgbaImage };

export interface CurvePoint {
  readonly x: number;
  readonly y: number;
}

export type MaskShape = 'none' | 'oval' | 'rounded-rect';
export type GoldRampId = 'bright' | 'deep' | 'champagne';

export interface GildingMaskParams {
  readonly shape: MaskShape;
  /** Feather width as a fraction of the image's shortest edge. */
  readonly feather: number;
  /** Morphological erosion radius in pixels. */
  readonly choke: number;
}

export interface GildingParams {
  readonly clarity: number;
  readonly clarityRadius: number;
  /** Level intensity from 0 (neutral) to 100 (strong). */
  readonly levels: number;
  readonly curvePoints: readonly CurvePoint[];
  readonly folds: number;
  readonly rampId: GoldRampId;
  readonly mask: GildingMaskParams;
}

export interface GildingPreset {
  readonly id: string;
  readonly name: string;
  readonly params: GildingParams;
}

export interface GoldRampStop {
  readonly position: number;
  readonly color: string;
}

export interface GoldRampDefinition {
  readonly id: GoldRampId;
  readonly name: string;
  readonly stops: readonly GoldRampStop[];
}

export interface LevelsSettings {
  readonly blackPoint: number;
  readonly whitePoint: number;
  readonly gamma: number;
}

