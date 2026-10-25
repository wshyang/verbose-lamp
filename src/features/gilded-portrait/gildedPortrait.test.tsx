// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadGildedPng } from './export';
import { loadRgbaImage, MAX_GILDED_IMAGE_EDGE } from './load';
import { GILDING_PRESETS } from './presets';
import type { RgbaImage } from './types';
import { useGildedPortrait } from './useGildedPortrait';

function solid(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 200;
    data[i + 1] = 120;
    data[i + 2] = 60;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

let bitmapClosed = 0;

beforeEach(() => {
  bitmapClosed = 0;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({
      width: 2_048,
      height: 1_024,
      close: () => {
        bitmapClosed += 1;
      },
    }))
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadRgbaImage', () => {
  it('fits the bitmap inside the edge limit and copies the pixels out', async () => {
    const image = await loadRgbaImage(new File(['x'], 'nick.png', { type: 'image/png' }));
    expect(image.width).toBe(MAX_GILDED_IMAGE_EDGE);
    expect(image.height).toBe(512);
    expect(image.data).toBeInstanceOf(Uint8ClampedArray);
    expect(bitmapClosed).toBe(1);
  });

  it('reports an unusable image when the bitmap is empty', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 0, height: 0, close: () => undefined })));
    await expect(loadRgbaImage(new File(['x'], 'empty.png', { type: 'image/png' }))).rejects.toThrow(
      'That image could not be opened.'
    );
  });

  it('reports an unusable image when decoding throws', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('decode'))));
    await expect(loadRgbaImage(new File(['x'], 'bad.png', { type: 'image/png' }))).rejects.toThrow(
      'could not be opened'
    );
  });
});

describe('downloadGildedPng', () => {
  it('draws the image into a canvas and downloads it with a safe stem', async () => {
    await downloadGildedPng(solid(4, 4), 'Daisy’s Locket.png');
    const [anchor] = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances as HTMLAnchorElement[];
    expect(anchor.download).toBe('daisy-s-locket.png');
  });

  it('falls back to the default stem', async () => {
    await downloadGildedPng(solid(4, 4), '***');
    const [anchor] = vi.mocked(HTMLAnchorElement.prototype.click).mock.instances as HTMLAnchorElement[];
    expect(anchor.download).toBe('gilded-portrait.png');
  });
});

describe('useGildedPortrait', () => {
  it('starts on the first preset with nothing loaded', () => {
    const { result } = renderHook(() => useGildedPortrait());
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.sourceImage).toBeNull();
    expect(result.current.gildedImage).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isShowingOriginal).toBe(false);
  });

  it('loads a file and gilds it with the current preset', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'nick.png', { type: 'image/png' }));
    });
    expect(result.current.sourceImage).not.toBeNull();
    expect(result.current.sourceName).toBe('nick.png');
    expect(result.current.gildedImage).not.toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isShowingOriginal).toBe(false);
  });

  it('ignores a null file and rejects an unsupported one', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(null);
    });
    expect(result.current.sourceImage).toBeNull();

    await act(async () => {
      await result.current.loadFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    });
    expect(result.current.error).toContain('Choose an image file');
  });

  it('surfaces a decode failure and clears the error on the next good load', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('decode'))));
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'bad.png', { type: 'image/png' }));
    });
    expect(result.current.error).toContain('could not be opened');

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 8, height: 8, close: () => undefined })));
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'good.png', { type: 'image/png' }));
    });
    expect(result.current.error).toBeNull();
    expect(result.current.sourceName).toBe('good.png');
  });

  it('clamps the gilding controls and drops the preset badge when edited', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setClarity(9));
    expect(result.current.params.clarity).toBe(1.6);
    expect(result.current.activePresetId).toBeNull();

    act(() => result.current.setClarity(-4));
    expect(result.current.params.clarity).toBe(0);
    act(() => result.current.setLevels(500));
    expect(result.current.params.levels).toBe(100);
    act(() => result.current.setFolds(9.6));
    expect(result.current.params.folds).toBe(4);
    act(() => result.current.setRamp('antique'));
    expect(result.current.params.rampId).toBe('antique');
  });

  it('turns the mask off and back on with sensible defaults', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setMaskShape('vignette'));
    expect(result.current.params.mask.feather).toBeGreaterThan(0);

    act(() => result.current.setMaskShape('none'));
    expect(result.current.params.mask).toEqual({ shape: 'none', feather: 0, choke: 0 });

    act(() => result.current.setMaskShape('ellipse'));
    expect(result.current.params.mask.feather).toBeGreaterThan(0);
  });

  it('reapplies a preset and toggles shimmer and original view', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShimmering(false));
    act(() => result.current.setShowingOriginal(true));
    expect(result.current.isShimmering).toBe(false);
    expect(result.current.isShowingOriginal).toBe(true);

    act(() => result.current.applyPreset(GILDING_PRESETS[1]));
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[1].id);
    expect(result.current.params).toEqual(GILDING_PRESETS[1].params);
  });

  it('downloads once an image is gilded, and reports export failures', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'nick.png', { type: 'image/png' }));
    });
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(false);

    const canvas = document.createElement('canvas');
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag)) as typeof document.createElement);
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.error).toContain('could not be prepared');
  });

  it('does nothing when exporting without an image', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(false);
  });

  it('hides the original view again after a new file loads', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShowingOriginal(true));
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'nick.png', { type: 'image/png' }));
    });
    expect(result.current.isShowingOriginal).toBe(false);
  });
});
