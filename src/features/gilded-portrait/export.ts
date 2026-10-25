import { toSafeFileStem } from '@/shared/lib/svgExport';
import type { RgbaImage } from './types';

function createImageCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG export is unavailable in this browser.');
  const pixels = context.createImageData(image.width, image.height);
  pixels.data.set(image.data);
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadGildedPng(image: RgbaImage, label = 'gilded-portrait'): Promise<void> {
  const canvas = createImageCanvas(image);
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('PNG export is unavailable in this browser.');
  const stem = label.replace(/\.[^.]+$/, '');
  triggerDownload(png, `${toSafeFileStem(stem, 'gilded-portrait')}.png`);
}