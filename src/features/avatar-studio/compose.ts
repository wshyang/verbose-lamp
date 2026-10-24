import { subjectAlpha } from '@/features/background-removal';
import { renderEnamelPanel, rampColour } from '@/features/enamel-backdrop';
import {
  DEFAULT_TINT_STRENGTH,
  GOLD_RAMPS,
  boxBlur,
  buildGoldRampLut,
  gildImage,
  tintImageGold,
  type GildingParams,
} from '@/features/gilded-portrait';
import { cropSquare, dilateAlpha, resampleAlpha, solidAlpha, type AlphaMask, type RgbaImage } from '@/shared/lib/raster';
import { framePaintAt } from './frame';
import type { AvatarComposition, ComposedAvatar, LayerComposition, SubjectInput, SubjectLayer } from './types';

/** Avatar edge in pixels; tests may pass a smaller `size`. */
export const AVATAR_SIZE = 512;
/** Gold outline width as a share of the avatar edge (≈ 6 px at 512). */
const OUTLINE_SHARE = 0.012;
/** How strongly each finish catches the moving glint (natural skin never does). */
const SHINE: Readonly<Record<SubjectInput['finish'], number>> = Object.freeze({ natural: 0, tinted: 0.6, gilded: 0.8 });

/** Full-frame gilding: the cut-out's alpha decides the shape, not the portrait's oval mask. */
export function subjectGildingParams(params: GildingParams): GildingParams {
  return { ...params, mask: { shape: 'none', feather: 0, choke: 0 } };
}

/** The subject's pixels for a finish. The whole square is finished before compositing (C's ordering). */
function finishPixels(image: SubjectLayer['pixels'], input: SubjectInput): SubjectLayer['pixels'] {
  switch (input.finish) {
    case 'natural':
      return image;
    case 'tinted':
      return tintImageGold(image, { rampId: input.gilding.rampId, strength: DEFAULT_TINT_STRENGTH });
    case 'gilded':
      return gildImage(image, subjectGildingParams(input.gilding));
  }
}

/** Steps 1–3 of the plan: crop, cut out, finish. Never mutates its input. */
export function cutOutSubject(input: SubjectInput): SubjectLayer {
  const { photo, crop, matte, tuning, size } = input;
  const cropped = cropSquare(photo, crop, size);
  const alpha = matte === null ? solidAlpha(size) : subjectAlpha({ matte: resampleAlpha(matte, crop, size), tuning, outSize: size });
  return { pixels: finishPixels(cropped, input), alpha, shine: SHINE[input.finish] };
}

/** A transparent subject, so the backdrop can be previewed before any photo is chosen. */
export function emptySubject(size: number): SubjectLayer {
  return { pixels: { width: size, height: size, data: new Uint8ClampedArray(size * size * 4) }, alpha: solidAlpha(size, 0), shine: 0 };
}

/** Below this alpha the subject's fringe is invisible; the outline starts here, not at the 50 % contour. */
const OUTLINE_THRESHOLD = 24;

/**
 * The band just outside the subject where the gold outline goes. It is measured from the
 * subject's visible extent and painted over the composite, so a soft matte edge can never
 * bury it, and it never covers any visible part of the person.
 */
export function outlineRing(alpha: AlphaMask): AlphaMask {
  const { width, height } = alpha;
  const radius = Math.max(1, Math.round(width * OUTLINE_SHARE));
  const solid = { width, height, data: Uint8ClampedArray.from(alpha.data, (value) => (value >= OUTLINE_THRESHOLD ? 255 : 0)) };
  const grown = dilateAlpha(solid, radius);
  const soft = boxBlur(Float32Array.from(grown.data, (value) => value / 255), { width, height, radius: Math.max(1, Math.round(radius / 3)) });
  const data = Uint8ClampedArray.from(solid.data, (value, pixel) => Math.max(0, Math.round(Math.min(1, soft[pixel]) * 255) - value));
  return { width, height, data };
}

interface PixelLayers {
  readonly input: LayerComposition;
  readonly ring: AlphaMask;
  readonly ramp: Uint8Array;
  readonly size: number;
}

function luma(data: Readonly<Uint8ClampedArray>, offset: number): number {
  return (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
}

function compositePixel(layers: PixelLayers, pixel: number, out: { image: Uint8ClampedArray; metal: Uint8ClampedArray }): void {
  const { input, ring, ramp, size } = layers;
  const { subject, backdrop } = input;
  const x = pixel % size;
  const y = Math.floor(pixel / size);
  const offset = pixel * 4;
  const ringShare = ring.data[pixel] / 255;
  const subjectShare = subject.alpha.data[pixel] / 255;
  const outline = rampColour(ramp, 0.6 + 0.32 * (1 - y / size));
  const paint = framePaintAt(input.frame, { x, y }, size);
  const rim = rampColour(ramp, paint.brightness);
  for (let channel = 0; channel < 3; channel += 1) {
    const layered = backdrop.image.data[offset + channel] * (1 - subjectShare) + subject.pixels.data[offset + channel] * subjectShare;
    const outlined = layered * (1 - ringShare) + outline[channel] * ringShare;
    out.image[offset + channel] = Math.round(outlined * (1 - paint.rim) + rim[channel] * paint.rim);
  }
  out.image[offset + 3] = Math.round(paint.coverage * 255);
  const backMetal = (backdrop.metal?.data[pixel] ?? 0) / 255;
  const subjectMetal = subject.shine * (0.4 + 0.6 * luma(subject.pixels.data, offset));
  const layeredMetal = (backMetal * (1 - subjectShare) + subjectMetal * subjectShare) * (1 - ringShare) + ringShare;
  const metal = layeredMetal * (1 - paint.rim) + paint.rim;
  out.metal[pixel] = Math.round(metal * paint.coverage * 255);
}

function assertLayerSizes(input: LayerComposition): number {
  const size = input.backdrop.image.width;
  const { pixels, alpha } = input.subject;
  if (input.backdrop.image.height !== size || pixels.width !== size || pixels.height !== size || alpha.width !== size) {
    throw new RangeError('Backdrop and subject layers must share one square size.');
  }
  return size;
}

/** Steps 5–7: gold outline, alpha composite, frame. Pure; returns new buffers. */
export function composeLayers(input: LayerComposition): ComposedAvatar {
  const size = assertLayerSizes(input);
  const layers: PixelLayers = { input, ring: outlineRing(input.subject.alpha), ramp: buildGoldRampLut(GOLD_RAMPS[input.rampId].stops), size };
  const out = { image: new Uint8ClampedArray(size * size * 4), metal: new Uint8ClampedArray(size * size) };
  for (let pixel = 0; pixel < size * size; pixel += 1) compositePixel(layers, pixel, out);
  return { image: { width: size, height: size, data: out.image }, metal: { width: size, height: size, data: out.metal } };
}

/** The whole plan in one call: crop → cut-out → finish → enamel backdrop → outline → composite → frame. */
export function composeAvatar(input: AvatarComposition): RgbaImage {
  const size = input.size ?? AVATAR_SIZE;
  const subject = cutOutSubject({ ...input, size });
  const backdrop = renderEnamelPanel(input.backdrop, size);
  return composeLayers({ subject, backdrop, frame: input.frame, rampId: input.backdrop.rampId }).image;
}
