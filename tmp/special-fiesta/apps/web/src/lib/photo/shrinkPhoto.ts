import { GALLERY_RAW_MAX_BYTES, GALLERY_RENDITION_MAX_BYTES, messages } from '@psd/contracts';

/**
 * Turning a camera photo into something a beach Wi-Fi uplink can carry (ADR-047).
 *
 * This is the load-bearing decision of the whole gallery, not an optimisation. A raw phone photo
 * is 3–12 MB; three hundred of those would melt one laptop's uplink. Re-encoded at 1280 px it is
 * ~250 kB, and the thumb the grid actually loads is ~20 kB.
 *
 * It also does the privacy work for free: **canvas re-encoding drops every EXIF tag, including
 * GPS**. The same step that saves bandwidth is the reason a photo taken at the event does not
 * carry its coordinates to everyone who views it.
 *
 * And it normalises format. An iPhone shoots HEIC, which only Safari decodes — but the
 * *uploading* iPhone decodes its own HEIC into a canvas, so what leaves the phone is WebP or
 * JPEG and every other device can read it.
 */

/** Big enough to look good full-screen on a phone, small enough to send over event Wi-Fi. */
export const GALLERY_FULL_SIZE = 1280;
/** What the grid loads: two dozen of these is half a megabyte, not fifty. */
export const GALLERY_THUMB_SIZE = 256;

const WEBP = 'image/webp';
const JPEG = 'image/jpeg';
const PNG = 'image/png';
const QUALITY = 0.82;

export class PhotoTooLargeError extends Error {
  constructor() {
    super(messages.galleryPhotoTooLarge);
    this.name = 'PhotoTooLargeError';
  }
}

/** The original itself is too big to archive, which is a different problem to say out loud. */
export class RawTooLargeError extends Error {
  constructor() {
    super(messages.galleryRawTooLarge);
    this.name = 'RawTooLargeError';
  }
}

export class PhotoUnreadableError extends Error {
  constructor() {
    super(messages.galleryPhotoNotAnImage);
    this.name = 'PhotoUnreadableError';
  }
}

export interface ShrunkPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /**
   * ADR-050 — the file for Corporate's archive. Normally the camera's own bytes, passed through
   * untouched. When the original is over the archive cap it is instead the largest, highest-quality
   * copy that fits (ADR-052), and `rawIsOriginal` says which of the two this is.
   */
  raw: Blob;
  filename: string;
  rawIsOriginal: boolean;
}

/**
 * ADR-052 — the ladder for fitting an oversized original under the archive cap.
 *
 * **Quality first, resolution last**, and that order is the whole point. A 30 MB HEIC re-encoded at
 * full resolution usually lands far under the cap, so spending quality buys the archive every pixel
 * it can keep; dropping resolution is what you do only once quality has run out.
 *
 * **PNG gets one rung, and only for an already-lossless source.** Measured in Chromium with the same
 * `toBlob` used here:
 *
 *   | source                    | -> PNG            | -> WebP q0.92 |
 *   |---------------------------|-------------------|---------------|
 *   | 3.4 MB JPEG, 2752x1536    | 9.0 MB  (2.68x)   | 1.0 MB        |
 *   | 104 kB JPEG, 746x560      | 800 kB  (7.71x)   | 108 kB        |
 *   | 2.9 MB PNG,  1024x1024    | 2.24 MB (0.77x)   | 198 kB        |
 *
 * So for a lossy original PNG is hopeless — it is already over the cap, and PNG would multiply it.
 * But a lossless original RE-ENCODES SMALLER, and if the result fits then it is a strictly better
 * archive than any lossy copy: Corporate gets the pixels exactly. That is worth one attempt, so a
 * PNG source gets a PNG rung before the quality ladder and a lossy source skips it.
 *
 * `toBlob` ignores the quality argument for `image/png` — verified, byte-identical output at 0.1 and
 * at the default — so there is no "maximum compression" to request. The one PNG rung is all there is.
 */
const ARCHIVE_QUALITIES = [0.92, 0.85, 0.75] as const;
const ARCHIVE_SCALE_STEP = 0.95;

export interface ArchiveAttempt {
  scale: number;
  quality: number;
  /** Set only for the lossless rung; the rest negotiate WebP-or-JPEG at encode time. */
  type?: string;
}

/**
 * Every attempt to make, in order, as pure data — no canvas, no file, no I/O.
 *
 * Separated from the encoding so the ladder itself can be reasoned about and tested: that it tries
 * full resolution before shrinking, that it shrinks by the documented 5 % step, and above all that
 * it TERMINATES. A progressive loop that can spin forever on a file which never fits is the failure
 * worth designing out rather than hoping about.
 *
 * **The floor is the served rendition, not an arbitrary fraction.** Shrinking past
 * `GALLERY_FULL_SIZE` would produce an "archive" smaller than the copy the gallery already hands
 * out on tap — which is worth nothing to Corporate and worth nothing to anybody else either. At
 * that point refusing is the useful answer.
 */
export function archiveAttempts(sourceLongestEdge: number, lossless = false): ArchiveAttempt[] {
  const attempts: ArchiveAttempt[] = [];
  // A lossless original may well re-encode smaller, and losslessly. Cheap to try, best if it wins.
  if (lossless) attempts.push({ scale: 1, quality: 1, type: PNG });
  attempts.push(...ARCHIVE_QUALITIES.map((quality) => ({ scale: 1, quality })));
  const lowest = ARCHIVE_QUALITIES[ARCHIVE_QUALITIES.length - 1] ?? 0.75;
  const floor = GALLERY_FULL_SIZE / Math.max(1, sourceLongestEdge);
  let scale = ARCHIVE_SCALE_STEP;
  while (scale >= floor) {
    attempts.push({ scale, quality: lowest });
    scale *= ARCHIVE_SCALE_STEP;
  }
  return attempts;
}

/** The archive copy's name must describe what it now is, not what it used to be. */
export function archiveFilenameFor(original: string, mime: string): string {
  const extension = mime === WEBP ? 'webp' : mime === PNG ? 'png' : 'jpg';
  const stem = original.replace(/\.[^./\\]+$/, '');
  return `${stem === '' ? 'photo' : stem}.${extension}`;
}

function scaled(width: number, height: number, longestEdge: number) {
  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, QUALITY);
  });
}

/**
 * Encodes to WebP where the browser can, and JPEG where it cannot.
 *
 * The check is on the *result* rather than on a feature test, because a canvas asked for a type
 * it does not support silently hands back PNG — and a PNG of a photograph is several times
 * larger than the JPEG we wanted, which would defeat the entire point of shrinking.
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const attempt = await toBlob(canvas, WEBP);
  if (attempt && attempt.type === WEBP) return attempt;
  const fallback = await toBlob(canvas, JPEG);
  if (!fallback) throw new PhotoUnreadableError();
  return fallback;
}

function draw(source: ImageBitmap, longestEdge: number): HTMLCanvasElement {
  const size = scaled(source.width, source.height, longestEdge);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context === null) throw new PhotoUnreadableError();
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

interface FittedArchive {
  blob: Blob;
  filename: string;
  isOriginal: boolean;
}

/**
 * ADR-052 — makes an oversized original fit, instead of handing the problem back.
 *
 * Bouncing the file would mean trusting whoever is holding the phone to know how to resize a photo
 * on a beach, which in practice means the archive simply does not get that photo. Walking the ladder
 * keeps the best copy the cap allows. It is a deliberate, recorded exception to "keep the original
 * unaltered" — `isOriginal` travels with it so the archive never claims to be pristine when it is
 * not.
 */
async function fitArchive(file: File, source: ImageBitmap): Promise<FittedArchive> {
  if (file.size <= GALLERY_RAW_MAX_BYTES) {
    return { blob: file, filename: file.name === '' ? 'photo' : file.name, isOriginal: true };
  }

  const sourceEdge = Math.max(source.width, source.height);
  const lossless = await isLosslessSource(file);
  for (const attempt of archiveAttempts(sourceEdge, lossless)) {
    const longestEdge = sourceEdge * attempt.scale;
    const canvas = draw(source, longestEdge);
    const encoded = await encodeAt(canvas, attempt);
    if (encoded && encoded.size <= GALLERY_RAW_MAX_BYTES) {
      return {
        blob: encoded,
        filename: archiveFilenameFor(file.name, encoded.type),
        isOriginal: false,
      };
    }
  }

  // Even the smallest rung did not fit. Refusing now is honest in a way refusing up front was not:
  // everything that could be tried has been.
  throw new RawTooLargeError();
}

/**
 * Honours a rung's requested type, and otherwise picks WebP-or-JPEG by checking the result — the
 * same choice made for the served renditions, for the same reason.
 */
async function encodeAt(canvas: HTMLCanvasElement, attempt: ArchiveAttempt): Promise<Blob | null> {
  if (attempt.type === PNG) return toBlobAt(canvas, PNG, 1);
  const webp = await toBlobAt(canvas, WEBP, attempt.quality);
  if (webp && webp.type === WEBP) return webp;
  return toBlobAt(canvas, JPEG, attempt.quality);
}

/**
 * Whether the original is already lossless, read from its own bytes rather than from `file.type` —
 * a picker's declared type is frequently empty and occasionally wrong.
 *
 * Only PNG is detected, deliberately. It is the lossless format a phone or laptop actually hands
 * over; TIFF and BMP are rare enough here that guessing at them would add branches nobody exercises.
 */
async function isLosslessSource(file: File): Promise<boolean> {
  /*
   * The magic bytes are the authority where they can be read. Where they cannot — an environment
   * whose `Blob.slice()` has no `arrayBuffer`, which includes jsdom — it falls back to the declared
   * type and then the extension rather than throwing.
   *
   * Degrading is right here because of what the answer is *for*: getting it wrong costs one wasted
   * encode attempt and nothing else. Nothing is authorised by it and no data depends on it.
   */
  const declared = file.type === PNG || /\.png$/i.test(file.name);
  try {
    const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (head.length < 4) return declared;
    return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  } catch {
    return declared;
  }
}

function toBlobAt(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export async function shrinkForGallery(file: File): Promise<ShrunkPhoto> {
  /*
   * This is where the format question is actually settled (ADR-050). The browser decodes the file
   * the device itself produced — an iPhone reads its own HEIC natively — and everything downstream
   * works on that decoded copy. So the phone is the only thing that ever needs to understand HEIC,
   * and the server needs no libheif, no sharp and no native dependency at all.
   *
   * A file this browser cannot decode fails here, which is the honest outcome: the alternative is
   * archiving an original nobody can ever produce a viewable version of.
   */
  const source = await createImageBitmap(file).catch(() => null);
  if (source === null) throw new PhotoUnreadableError();

  try {
    const fullCanvas = draw(source, GALLERY_FULL_SIZE);
    const [full, thumb] = await Promise.all([
      encode(fullCanvas),
      encode(draw(source, GALLERY_THUMB_SIZE)),
    ]);

    // The server enforces this too, and its check is the real one. Failing here as well means a
    // participant learns straight away instead of after uploading a quarter-megabyte.
    if (full.size > GALLERY_RENDITION_MAX_BYTES) throw new PhotoTooLargeError();

    // Done last, because it is the only step that may spend several encodes (ADR-052): no point
    // paying for them if the renditions were never going to work.
    const archive = await fitArchive(file, source);

    return {
      full,
      thumb,
      width: fullCanvas.width,
      height: fullCanvas.height,
      raw: archive.blob,
      filename: archive.filename,
      rawIsOriginal: archive.isOriginal,
    };
  } finally {
    source.close();
  }
}
