import { centreSquare, cropImage, EYE_LINE } from '../model/cropBox';
import { parseIndexedSprite, spriteToImage, spriteToMatte } from '../model/sprite';
import type { AlphaMask, AvatarSubject, CropBox, RgbaImage } from '../model/types';
import { locateFace, type FaceLocation } from './faceLocator';
import { segmentSubject } from './segmenter';

/** Studio canvas side. 256 = a 128-cell sprite at exactly 2×. */
export const STUDIO_SIDE = 256;

export interface SubjectEngines {
  readonly locate: (image: RgbaImage) => Promise<FaceLocation | null>;
  readonly segment: (image: RgbaImage) => Promise<AlphaMask | null>;
}

export const BROWSER_ENGINES: SubjectEngines = { locate: locateFace, segment: segmentSubject };

export type PrepareStage = 'detecting-face' | 'removing-background';

export interface PreparedSubject extends AvatarSubject {
  readonly isFaceFound: boolean;
  readonly crop: CropBox;
}

interface PrepareOptions {
  readonly label: string;
  readonly engines?: SubjectEngines;
  readonly onStage?: (stage: PrepareStage) => void;
}

/** Photo → face crop → background matte. Each step degrades gracefully to null. */
export async function preparePhotoSubject(photo: RgbaImage, options: PrepareOptions): Promise<PreparedSubject> {
  const engines = options.engines ?? BROWSER_ENGINES;
  options.onStage?.('detecting-face');
  const location = await engines.locate(photo);
  const crop = location?.crop ?? centreSquare(photo);
  const image = cropImage(photo, crop, STUDIO_SIDE);
  options.onStage?.('removing-background');
  const matte = await engines.segment(image);
  return { label: options.label, image, matte, crop, isFaceFound: location !== null };
}

/** The seed the matte keeps: the eye line of a face crop, the centre otherwise. */
export function seedFor(isFaceFound: boolean): { x: number; y: number } {
  return isFaceFound ? { x: 0.5, y: EYE_LINE } : { x: 0.5, y: 0.5 };
}

/** A stored indexed sprite (e.g. Wei_Ling) → studio subject, matte read from its palette. */
export function subjectFromSprite(code: string, label: string): PreparedSubject | null {
  const sprite = parseIndexedSprite(code);
  if (sprite === null) return null;
  const scale = Math.max(1, Math.round(STUDIO_SIDE / sprite.size));
  return {
    label,
    image: spriteToImage(sprite, scale),
    matte: spriteToMatte(sprite, scale),
    crop: { x: 0, y: 0, size: sprite.size },
    isFaceFound: true,
  };
}
