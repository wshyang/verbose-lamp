import type { AlphaMask, RgbaImage } from '@/features/gilded-portrait';

export type { AlphaMask, RgbaImage };

/** Where the head is in the photo, as a square in photo pixel coordinates. */
export interface CropBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** A normalised (0-1) keypoint, as face detectors report them. */
export interface Keypoint {
  readonly x: number;
  readonly y: number;
}

/** The detector-neutral shape of one face: normalised box height and eye keypoints. */
export interface FaceDetection {
  /** Box height in pixels; used as a floor when the head is turned. */
  readonly boxHeight: number;
  readonly boxWidth: number;
  readonly rightEye: Keypoint;
  readonly leftEye: Keypoint;
}

/** A subject ready for the studio: square pixels plus a 0-255 matte (255 = person). */
export interface AvatarSubject {
  readonly label: string;
  readonly image: RgbaImage;
  readonly matte: AlphaMask | null;
}

export interface MatteTuning {
  /** 0 disables background removal entirely. */
  readonly isBackgroundRemoved: boolean;
  /** Alpha (1-254) a pixel needs to count as subject. */
  readonly threshold: number;
  /** Pixels to grow (+) or shrink (-) the subject edge, -4..4. */
  readonly edge: number;
  /** Feather radius in pixels for the final soft edge. */
  readonly feather: number;
}

export type BackdropPatternId = 'sunburst' | 'fan' | 'concentric' | 'waves' | 'chevron';
export type EnamelPaletteId = 'peacock' | 'ruby' | 'jade' | 'midnight' | 'sunset';
export type SubjectFinish = 'gilded' | 'natural';

export interface BackdropStyle {
  readonly pattern: BackdropPatternId;
  readonly palette: EnamelPaletteId;
  /** Number of rays / rings / bands. */
  readonly bands: number;
  /** Spiral drag, radians per unit radius (sunburst only). */
  readonly twist: number;
}

export interface EnamelPalette {
  readonly id: EnamelPaletteId;
  readonly name: string;
  /** Jewel-tone enamel colours laid between gold cloisons. */
  readonly enamels: readonly string[];
}
