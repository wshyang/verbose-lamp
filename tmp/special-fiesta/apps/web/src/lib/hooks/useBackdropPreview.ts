import { useEffect, useRef, useState } from 'react';
import { readAvatarLook } from '@psd/contracts';
import { backdropPreview } from '../avatar/backdropPreview.js';
import type { CutOutTuning } from '../avatar/cutOut.js';
import type { Bitmap, SubjectMask } from '../avatar/types.js';

/**
 * ADR-224 — the cropper's picture with the backdrop behind the person, as an image the browser can show.
 *
 * The picture is rebuilt in an effect, after the change that caused it has painted, so a choice is never
 * held up by the work of cutting the frame out. It is rebuilt only when the photograph, its matte, the
 * settled cut-out tuning or the look change. While the square is open the backdrop cannot change (ADR-234:
 * the studio is behind the dialog), so in practice the tuning is what rebuilds it. Each blob URL is revoked
 * as soon as it is replaced, so a participant who taps through the cut-out choices does not leave a trail of
 * pictures in memory.
 *
 * Returns null when there is nothing to show, and also when the browser cannot encode it (jsdom has no
 * canvas). The cropper then shows the raw photograph, which is what it showed before this change.
 */
export function useBackdropPreview(input: {
  bitmap: Bitmap | null;
  subject: SubjectMask | null;
  tuning: CutOutTuning;
  avatarLook: string;
}): string | null {
  const { bitmap, subject, tuning, avatarLook } = input;
  const [url, setUrl] = useState<string | null>(null);
  const shown = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    const replaceWith = (next: string | null) => {
      if (shown.current !== null) URL.revokeObjectURL(shown.current);
      shown.current = next;
      setUrl(next);
    };
    const pixels = bitmap === null ? null : pictureFor(bitmap, { subject, tuning, avatarLook });
    if (pixels === null) {
      replaceWith(null);
      return;
    }
    void encodePng(pixels).then((next) => {
      if (current) replaceWith(next);
      else if (next !== null) URL.revokeObjectURL(next);
    });
    return () => {
      current = false;
    };
  }, [bitmap, subject, tuning, avatarLook]);

  useEffect(
    () => () => {
      if (shown.current !== null) URL.revokeObjectURL(shown.current);
      shown.current = null;
    },
    [],
  );

  return url;
}

function pictureFor(
  bitmap: Bitmap,
  input: { subject: SubjectMask | null; tuning: CutOutTuning; avatarLook: string },
): Bitmap | null {
  const look = readAvatarLook(input.avatarLook);
  return backdropPreview(bitmap, {
    subject: input.subject,
    tuning: input.tuning,
    backdrop: look.backdrop,
    sunburst: look.sunburst,
  });
}

/** Encodes the pixels as a PNG blob URL. Any failure, including a missing canvas, yields null. */
async function encodePng(image: Bitmap): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (context === null || typeof canvas.toBlob !== 'function') return null;
    // A copy, because `ImageData` only accepts an array over a plain ArrayBuffer, not a SharedArrayBuffer.
    const pixels = new Uint8ClampedArray(image.pixels);
    context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob === null ? null : URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
