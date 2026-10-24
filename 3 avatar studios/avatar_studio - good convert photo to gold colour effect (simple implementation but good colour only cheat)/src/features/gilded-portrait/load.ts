import { fitWithin } from './fit';
import type { RgbaImage } from './types';

export const MAX_GILDED_IMAGE_EDGE = 1024;
const IMAGE_LOAD_ERROR = 'That image could not be opened. Try a different PNG, JPEG, or WebP file.';

export async function loadRgbaImage(file: File): Promise<RgbaImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height, MAX_GILDED_IMAGE_EDGE);
    if (size.width === 0 || size.height === 0) throw new Error(IMAGE_LOAD_ERROR);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error(IMAGE_LOAD_ERROR);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const pixels = context.getImageData(0, 0, size.width, size.height);
    return { width: size.width, height: size.height, data: new Uint8ClampedArray(pixels.data) };
  } catch {
    throw new Error(IMAGE_LOAD_ERROR);
  } finally {
    bitmap?.close();
  }
}