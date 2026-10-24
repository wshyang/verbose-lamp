import type { CutOutTuning, SubjectMatte } from '@/features/background-removal';
import type { BackdropSpec } from '@/features/enamel-backdrop';
import type { GildingParams, GoldRampId } from '@/features/gilded-portrait';
import type { AlphaMask, RgbaImage, SquareBox } from '@/shared/lib/raster';

/**
 * Natural keeps the photo's colour (B); tinted is the quick gold wash (A); gilded runs the
 * full gilded-portrait pipeline with its controls (C). See ADDENDUM-019.
 */
export type SubjectFinish = 'natural' | 'tinted' | 'gilded';
export type AvatarFrame = 'medallion' | 'plaque';
export type StudioStage = 'idle' | 'working' | 'refining' | 'ready' | 'plain' | 'cropping' | 'failed';

export interface SubjectInput {
  readonly photo: RgbaImage;
  readonly crop: SquareBox;
  /** Matte over the whole photo, or null when background removal was unavailable. */
  readonly matte: SubjectMatte | null;
  readonly tuning: CutOutTuning;
  readonly finish: SubjectFinish;
  readonly gilding: GildingParams;
  readonly size: number;
}

/** The cut-out subject at avatar size: pixels, soft alpha and how metallic it reads (0–1). */
export interface SubjectLayer {
  readonly pixels: RgbaImage;
  readonly alpha: AlphaMask;
  readonly shine: number;
}

/** A rendered backdrop; `metal` (optional) marks polished gold for the moving glint. */
export interface BackdropLayer {
  readonly image: RgbaImage;
  readonly metal?: AlphaMask;
}

export interface LayerComposition {
  readonly subject: SubjectLayer;
  readonly backdrop: BackdropLayer;
  readonly frame: AvatarFrame;
  readonly rampId: GoldRampId;
}

export interface ComposedAvatar {
  readonly image: RgbaImage;
  /** 0–255 per pixel: how strongly light catches it (gold wires, rims, gilded skin). */
  readonly metal: AlphaMask;
}

export interface AvatarComposition extends Omit<SubjectInput, 'size'> {
  readonly backdrop: BackdropSpec;
  readonly frame: AvatarFrame;
  readonly size?: number;
}

export interface AvatarSample {
  readonly id: string;
  readonly name: string;
  readonly persona: string;
  readonly src: string;
}

export interface StageFacts {
  readonly hasImage: boolean;
  readonly error: string | null;
  readonly crop: SquareBox | null;
  readonly matte: SubjectMatte | null;
  readonly isLocating: boolean;
  readonly isSegmenting: boolean;
}
