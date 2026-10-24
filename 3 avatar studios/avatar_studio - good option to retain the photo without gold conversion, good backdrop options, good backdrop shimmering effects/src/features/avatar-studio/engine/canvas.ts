import type { RgbaImage } from '../model/types';

/** Detectors and segmenters want an image source, not a pixel array. */
export function canvasFromImage(image: RgbaImage): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (context === null) return null;
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}
