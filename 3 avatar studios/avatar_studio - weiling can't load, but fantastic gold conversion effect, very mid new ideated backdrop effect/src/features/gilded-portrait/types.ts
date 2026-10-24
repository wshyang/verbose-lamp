export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Readonly<Uint8ClampedArray>;
}

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

export interface RasterDimensions {
  readonly width: number;
  readonly height: number;
}

export interface AlphaMask extends RasterDimensions {
  readonly data: Uint8ClampedArray;
}

export interface FaceBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type FaceDetectionSource = 'browser' | 'mediapipe';

export interface FaceDetection {
  readonly box: FaceBox;
  readonly confidence: number | null;
  readonly source: FaceDetectionSource;
}

export interface SubjectMask extends RasterDimensions {
  /** One byte of subject confidence per pixel: 0 background, 255 subject. */
  readonly alpha: Uint8Array;
}

export type BackdropId = 'sapphire-fan' | 'emerald-lacquer' | 'ruby-mosaic';

export type PortraitAnalysisStatus =
  | 'idle'
  | 'detecting-face'
  | 'removing-background'
  | 'ready'
  | 'fallback';