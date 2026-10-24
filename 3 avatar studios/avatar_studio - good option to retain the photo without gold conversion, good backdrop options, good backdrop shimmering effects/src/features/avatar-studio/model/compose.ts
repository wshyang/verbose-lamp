import { boxBlur, GILDING_PRESETS, gildImage } from '@/features/gilded-portrait';
import type { GildingParams } from '@/features/gilded-portrait';
import type { AlphaMask, RgbaImage, SubjectFinish } from './types';

/** The gilded-portrait preset used for subjects: full frame, so the matte decides the shape. */
export function subjectGildingParams(): GildingParams {
  const base = GILDING_PRESETS[0].params;
  return { ...base, mask: { ...base.mask, shape: 'none', choke: 0 } };
}

/** Pick the subject pixels for the chosen finish. Pure; gilding is the expensive step. */
export function finishSubject(image: RgbaImage, finish: SubjectFinish): RgbaImage {
  return finish === 'gilded' ? gildImage(image, subjectGildingParams()) : image;
}

/** A soft ring just outside the subject: where the gold outline is inlaid. */
export function haloOf(matte: AlphaMask, radius: number): AlphaMask {
  const { width, height } = matte;
  const spread = boxBlur(Float32Array.from(matte.data, (value) => value / 255), { width, height, radius });
  const data = new Uint8ClampedArray(width * height);
  for (let at = 0; at < data.length; at += 1) {
    const outside = Math.max(0, spread[at] * 2.2 - matte.data[at] / 255);
    data[at] = Math.round(Math.min(1, outside) * 255);
  }
  return { width, height, data };
}

export interface ComposeInput {
  readonly backdrop: RgbaImage;
  readonly subject: RgbaImage;
  readonly matte: AlphaMask;
  readonly halo: AlphaMask | null;
}

const RIM = [255, 236, 170] as const;

function assertSameSize(input: ComposeInput): void {
  const { backdrop, subject, matte } = input;
  const isSame = backdrop.width === subject.width && subject.width === matte.width
    && backdrop.height === subject.height && subject.height === matte.height;
  if (!isSame) throw new RangeError('Backdrop, subject and matte must share dimensions.');
}

/** backdrop → gold rim → subject, alpha-blended per pixel. */
export function composeAvatar(input: ComposeInput): RgbaImage {
  assertSameSize(input);
  const { backdrop, subject, matte, halo } = input;
  const data = new Uint8ClampedArray(backdrop.data.length);
  for (let pixel = 0; pixel < matte.data.length; pixel += 1) {
    const alpha = matte.data[pixel] / 255;
    const rim = halo === null ? 0 : (halo.data[pixel] / 255) * 0.85;
    const at = pixel * 4;
    for (let c = 0; c < 3; c += 1) {
      const behind = backdrop.data[at + c] * (1 - rim) + RIM[c] * rim;
      data[at + c] = Math.round(behind * (1 - alpha) + subject.data[at + c] * alpha);
    }
    data[at + 3] = 255;
  }
  return { width: backdrop.width, height: backdrop.height, data };
}
