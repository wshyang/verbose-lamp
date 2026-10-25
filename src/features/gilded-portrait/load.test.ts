// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRgbaImage, MAX_GILDED_IMAGE_EDGE } from './load';

function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close })),
  );
  return close;
}

function stubContext(pixels: Uint8ClampedArray | null) {
  const context = pixels
    ? {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: pixels })),
      }
    : null;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

function file() {
  return new File([new Uint8Array([9])], 'portrait.png', { type: 'image/png' });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadRgbaImage', () => {
  it('downscales the bitmap to the maximum edge and copies its pixels', async () => {
    const close = stubBitmap(MAX_GILDED_IMAGE_EDGE * 2, MAX_GILDED_IMAGE_EDGE);
    const context = stubContext(new Uint8ClampedArray(MAX_GILDED_IMAGE_EDGE * MAX_GILDED_IMAGE_EDGE * 4));

    const loaded = await loadRgbaImage(file());

    expect(loaded.width).toBe(MAX_GILDED_IMAGE_EDGE);
    expect(loaded.height).toBe(MAX_GILDED_IMAGE_EDGE / 2);
    expect(context?.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, loaded.width, loaded.height);
    expect(loaded.data).toBeInstanceOf(Uint8ClampedArray);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps a small image at its own size', async () => {
    stubBitmap(40, 30);
    stubContext(new Uint8ClampedArray(40 * 30 * 4));
    const loaded = await loadRgbaImage(file());
    expect([loaded.width, loaded.height]).toEqual([40, 30]);
  });

  it('rejects a bitmap with no drawable pixels and closes it', async () => {
    const close = stubBitmap(0, 0);
    stubContext(new Uint8ClampedArray(4));
    await expect(loadRgbaImage(file())).rejects.toThrow('That image could not be opened.');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rejects when the canvas has no 2D context', async () => {
    stubBitmap(10, 10);
    stubContext(null);
    await expect(loadRgbaImage(file())).rejects.toThrow('That image could not be opened.');
  });

  it('rejects when the file cannot be decoded at all', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    await expect(loadRgbaImage(file())).rejects.toThrow('That image could not be opened.');
  });
});
