// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d, type Canvas2d } from '@/test/canvas2d';
import { loadRgbaImage, MAX_GILDED_IMAGE_EDGE } from './load';

setupDomTests();

const loadError = 'That image could not be opened. Try a different PNG, JPEG, or WebP file.';

let canvas: Canvas2d;
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  canvas = installCanvas2d();
  bitmap = { width: 400, height: 300, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
});

const file = (name = 'portrait.png') => new File(['pixels'], name, { type: 'image/png' });

describe('loadRgbaImage', () => {
  it('decodes through an ImageBitmap at the natural size', async () => {
    const image = await loadRgbaImage(file());

    expect(image.width).toBe(400);
    expect(image.height).toBe(300);
    expect(image.data).toBeInstanceOf(Uint8ClampedArray);
    expect(image.data).toHaveLength(400 * 300 * 4);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('asks the canvas to be read back frequently', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    await loadRgbaImage(file());

    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
  });

  it('copies the pixel buffer instead of aliasing the canvas', async () => {
    const image = await loadRgbaImage(file());

    // The recording context hands back a fresh zero-filled buffer each read.
    expect(image.data.every((value) => value === 0)).toBe(true);
    expect(canvas.calls).toContain('getImageData(400x300)');
  });

  it('downscales oversized images to the gilding budget', async () => {
    bitmap.width = MAX_GILDED_IMAGE_EDGE * 3;
    bitmap.height = MAX_GILDED_IMAGE_EDGE * 2;

    const image = await loadRgbaImage(file());

    expect(Math.max(image.width, image.height)).toBe(MAX_GILDED_IMAGE_EDGE);
    expect(image.width).toBe(MAX_GILDED_IMAGE_EDGE);
    expect(image.height).toBe(Math.round(MAX_GILDED_IMAGE_EDGE / 1.5));
    expect(canvas.calls).toContain(`drawImage([object Object],0,0,${image.width},${image.height})`);
  });

  it('rejects when the bitmap cannot be decoded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('nope'))));

    await expect(loadRgbaImage(file())).rejects.toThrow(loadError);
  });

  it('closes the bitmap even when decoding fails part-way', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(loadRgbaImage(file())).rejects.toThrow(loadError);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('rejects a zero-sized bitmap', async () => {
    bitmap.width = 0;
    bitmap.height = 0;

    await expect(loadRgbaImage(file())).rejects.toThrow(loadError);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
