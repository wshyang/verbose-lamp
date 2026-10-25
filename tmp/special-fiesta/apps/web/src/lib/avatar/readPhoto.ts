import { messages } from '@psd/contracts';
import { locateFace, type TasksVisionLoader } from './locateFace.js';
import { photoToSprite, type Bitmap, type CropBox, type SubjectMask } from './photoSprite.js';
import { segmentSubject, type TransformersLoader } from './segmentPhoto.js';

/**
 * ADR-031/033/034 — the only parts of the photo feature that need a browser.
 *
 * It decodes the file the participant chose, draws it into a canvas at a working size,
 * reads the pixels back, and hands them to the pure pipeline. The file is never uploaded
 * and never kept: what leaves this module is a sprite code a few kilobytes long.
 */

/**
 * Big enough that a face keeps its detail, small enough to decode instantly on a phone.
 * ADR-037 — five photo pixels per sprite cell at 128×128; at the old 320 the resampler
 * would have had barely two, and the extra detail the bigger grid exists for would have
 * been thrown away before it was ever sampled.
 */
const WORKING_SIZE = 640;

export class PhotoError extends Error {
  constructor() {
    super(messages.avatarPhotoInvalid);
    this.name = 'PhotoError';
  }
}

async function bitmapFrom(file: Blob): Promise<Bitmap> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, WORKING_SIZE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new PhotoError();
  context.drawImage(image, 0, 0, width, height);
  image.close();
  return { width, height, pixels: context.getImageData(0, 0, width, height).data };
}

interface DetectedFace {
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface FaceDetectorLike {
  detect: (source: Blob) => Promise<DetectedFace[]>;
}

/**
 * ADR-034 — the browser's own face detector, where there is one.
 *
 * Chromium on Android and macOS ships the Shape Detection API, which hands back a real
 * face box for nothing: no download, no model, a couple of milliseconds. Everywhere else
 * this returns null and the crop falls back to the segmentation mask, and then to the
 * skin-colour estimate. It is the cheapest good answer, so it is tried first.
 */
export async function detectFaceBox(file: Blob, bitmap: Bitmap): Promise<CropBox | null> {
  const available = (globalThis as { FaceDetector?: new () => FaceDetectorLike }).FaceDetector;
  if (available === undefined) return null;
  const faces = await new available().detect(file).catch(() => []);
  const [face] = faces;
  if (face === undefined) return null;
  const { x, y, width, height } = face.boundingBox;
  const scale = bitmap.width / Math.max(1, Math.max(bitmap.width, bitmap.height));
  void scale;
  // A detector box is the face; a portrait is a head, which is about half as tall again,
  // in a frame where the head takes 72 % of the height and the eyes sit at 52 %.
  const size = Math.min(Math.max(bitmap.width, bitmap.height), (height * 1.45) / 0.72);
  const centreX = x + width / 2;
  const eyeY = y + height * 0.42;
  return {
    x: Math.min(Math.max(centreX - size / 2, 0), Math.max(0, bitmap.width - size)),
    y: Math.min(Math.max(eyeY - size * 0.52, 0), Math.max(0, bitmap.height - size)),
    size,
  };
}

export interface PhotoConversion {
  /** The sprite to show now, cut out by colour (ADR-031/032). */
  sprite: string;
  /** Kept so the model can have a go at the same pixels without decoding again. */
  bitmap: Bitmap;
  /** A real face box, if the browser could give one. */
  crop: CropBox | null;
}

/** ADR-054 — what the upgrade pass achieved, and whether anything found a face at all. */
export interface PhotoRefinement {
  sprite: string;
  /**
   * The model's cut-out, kept so a later re-crop can REUSE it.
   *
   * ADR-056 — without this, adjusting the square silently threw the background removal away and
   * dropped the photo back to the colour rules, which cannot cut a hawker centre out from behind
   * anybody. It was already possible to hit through "choose the square myself"; showing the square
   * after every conversion made it the normal path, which is how it was finally noticed.
   */
  subject: SubjectMask | null;
  /**
   * The crop this sprite was actually framed by, or null when **nothing located a face** and the
   * framing is only the skin estimate. The caller must ask for the manual square in that case
   * rather than presenting the result as finished (ADR-036/054).
   */
  crop: CropBox | null;
}

/**
 * The instant answer. Colour rules only: no download, no model, a few milliseconds — so
 * the participant sees themselves straight away.
 */
export async function photoFileToSprite(
  file: Blob,
  colours: { backdrop: string; ink: string },
): Promise<PhotoConversion> {
  const attempt = await bitmapFrom(file).catch(() => null);
  if (attempt === null) throw new PhotoError();
  const crop = await detectFaceBox(file, attempt).catch(() => null);
  return { sprite: photoToSprite(attempt, { ...colours, crop }), bitmap: attempt, crop };
}

/**
 * ADR-033/054 — the better answer, when it can be had, and it is now TWO answers from two
 * models doing two different jobs.
 *
 * MODNET cuts the café or the crowd out from behind a selfie. BlazeFace says where the face is.
 * Keeping them apart is the fix for ADR-053: the mask used to be asked to do both, and inferring
 * a head from a silhouette produced an avatar of somebody's hand. Either can come back empty
 * without costing the other — a cut-out with no face still improves the picture, and a face with
 * no cut-out still fixes the framing.
 *
 * Returns null only when **neither** model added anything, in which case the caller keeps what it
 * already showed.
 */
export async function refineWithModel(
  input: { bitmap: Bitmap; crop: CropBox | null },
  colours: { backdrop: string; ink: string },
  load?: { transformers?: TransformersLoader; vision?: TasksVisionLoader },
): Promise<PhotoRefinement | null> {
  // The browser's own detector already answered, if it has one; only pay for the download when it
  // did not. Both are real face locators, so either is trusted over the skin estimate.
  const crop = input.crop ?? (await locateFace(input.bitmap, ...(load?.vision ? [load.vision] : [])));
  const subject = await segmentSubject(input.bitmap, ...(load?.transformers ? [load.transformers] : []));
  if (subject === null && crop === input.crop) return null;
  return { sprite: photoToSprite(input.bitmap, { ...colours, subject, crop }), crop, subject };
}
