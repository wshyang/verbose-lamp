// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadGildedPng } from './export';
import { loadRgbaImage, MAX_GILDED_IMAGE_EDGE } from './load';
import type { RgbaImage } from './types';

const IMAGE: RgbaImage = { width: 2, height: 1, data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]) };

let context: Record<string, ReturnType<typeof vi.fn>> | null;
let blob: Blob | null;
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((done: (value: Blob | null) => void) => done(blob)),
  };
}

beforeEach(() => {
  const pixels = {
    width: 2, height: 1, data: new Uint8ClampedArray(IMAGE.data),
  };
  context = {
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(8) })),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => pixels),
  };
  blob = new Blob(['png']);
  bitmap = { width: 2048, height: 1024, close: vi.fn() };
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? fakeCanvas() : original(tag)) as typeof document.createElement);
  vi.stubGlobal('URL', {
    ...URL, createObjectURL: vi.fn(() => 'blob:gilded'), revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadGildedPng', () => {
  it('paints, names from labels/extensions/defaults, downloads, and revokes later', async () => {
    vi.useFakeTimers();
    await downloadGildedPng(IMAGE, 'My Portrait.JPEG');
    expect(context?.putImageData).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:gilded');
    await downloadGildedPng(IMAGE);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('throws when canvas context or PNG blob is unavailable', async () => {
    context = null;
    await expect(downloadGildedPng(IMAGE)).rejects.toThrow('PNG export is unavailable');
    context = { createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(8) })), putImageData: vi.fn() };
    blob = null;
    await expect(downloadGildedPng(IMAGE)).rejects.toThrow('PNG export is unavailable');
  });
});

describe('loadRgbaImage', () => {
  it('fits to the maximum edge, copies pixels, and closes the bitmap', async () => {
    const file = new File(['x'], 'x.jpg');
    const image = await loadRgbaImage(file);
    expect(image.width).toBe(MAX_GILDED_IMAGE_EDGE);
    expect(image.height).toBe(512);
    expect(image.data).toEqual(IMAGE.data);
    expect(image.data).not.toBe(IMAGE.data);
    expect(context?.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 512);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('normalises zero dimensions, missing contexts, and bitmap failures', async () => {
    bitmap.width = 0;
    await expect(loadRgbaImage(new File([], 'x'))).rejects.toThrow('could not be opened');
    expect(bitmap.close).toHaveBeenCalledOnce();

    bitmap = { width: 20, height: 0, close: vi.fn() };
    await expect(loadRgbaImage(new File([], 'x'))).rejects.toThrow('could not be opened');

    bitmap = { width: 20, height: 10, close: vi.fn() };
    context = null;
    await expect(loadRgbaImage(new File([], 'x'))).rejects.toThrow('could not be opened');
    expect(bitmap.close).toHaveBeenCalledOnce();

    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
    await expect(loadRgbaImage(new File([], 'x'))).rejects.toThrow('could not be opened');
  });
});
