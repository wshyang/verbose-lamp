// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import { type RgbaImage } from './types';

import { GILDING_PRESETS } from './presets';

import { useGildedPortrait } from './useGildedPortrait';

const io = vi.hoisted(() => ({
  loadRgbaImage: vi.fn(),
  downloadGildedPng: vi.fn(),
}));
vi.mock('./load', () => ({ loadRgbaImage: io.loadRgbaImage }));
vi.mock('./export', () => ({ downloadGildedPng: io.downloadGildedPng }));
function portraitPixels(width = 4, height = 4): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 90;
    data[i * 4 + 1] = 80;
    data[i * 4 + 2] = 60;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
function portraitFile(name = 'daisy.png') {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}
afterEach(() => {
  vi.clearAllMocks();
});
describe('useGildedPortrait', () => {
  it('starts on the first preset with no image', () => {
    const { result } = renderHook(() => useGildedPortrait());
    expect(result.current.sourceImage).toBeNull();
    expect(result.current.gildedImage).toBeNull();
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('gilds a loaded image and reports its file name', async () => {
    io.loadRgbaImage.mockResolvedValue(portraitPixels());
    const { result } = renderHook(() => useGildedPortrait());

    await act(async () => {
      await result.current.loadFile(portraitFile('daisy.png'));
    });

    expect(io.loadRgbaImage).toHaveBeenCalledTimes(1);
    expect(result.current.sourceName).toBe('daisy.png');
    expect(result.current.sourceImage?.width).toBe(4);
    expect(result.current.gildedImage?.data.length).toBe(64);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores an empty selection and rejects a file with the wrong type', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(null);
    });
    expect(io.loadRgbaImage).not.toHaveBeenCalled();

    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await act(async () => {
      await result.current.loadFile(textFile);
    });
    expect(result.current.error).toMatch(/PNG|JPEG|WebP|supported/i);
    expect(result.current.sourceImage).toBeNull();
  });

  it('surfaces a readable error when decoding fails', async () => {
    io.loadRgbaImage.mockRejectedValueOnce(new Error('That image could not be opened.'));
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(portraitFile('broken.png'));
    });
    expect(result.current.error).toBe('That image could not be opened.');
    expect(result.current.isLoading).toBe(false);
  });

  it('falls back to a friendly message when decoding rejects with a non-error', async () => {
    io.loadRgbaImage.mockRejectedValueOnce('not an Error');
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(portraitFile('odd.png'));
    });
    expect(result.current.error).toBe('That image could not be opened.');
  });

  it('drops a stale load result when a newer file wins', async () => {
    let resolveFirst: (image: RgbaImage) => void = () => {};
    io.loadRgbaImage
      .mockImplementationOnce(() => new Promise<RgbaImage>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(portraitPixels(8, 8));

    const { result } = renderHook(() => useGildedPortrait());
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadFile(portraitFile('first.png'));
    });
    await act(async () => {
      await result.current.loadFile(portraitFile('second.png'));
    });
    expect(result.current.sourceName).toBe('second.png');

    await act(async () => {
      resolveFirst(portraitPixels(2, 2));
      await first;
    });
    expect(result.current.sourceName).toBe('second.png');
    expect(result.current.sourceImage?.width).toBe(8);
  });

  it('drops a stale load failure when a newer file wins', async () => {
    let rejectFirst: (error: Error) => void = () => {};
    io.loadRgbaImage
      .mockImplementationOnce(() => new Promise<RgbaImage>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce(portraitPixels(8, 8));

    const { result } = renderHook(() => useGildedPortrait());
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadFile(portraitFile('first.png'));
    });
    await act(async () => {
      await result.current.loadFile(portraitFile('second.png'));
    });
    await act(async () => {
      rejectFirst(new Error('that first frame was corrupt'));
      await first;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.sourceName).toBe('second.png');
    expect(result.current.isLoading).toBe(false);
  });

  it('applies presets and clears the preset marker once a slider moves', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.applyPreset(GILDING_PRESETS[1]));
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[1].id);
    expect(result.current.params.rampId).toBe(GILDING_PRESETS[1].params.rampId);

    act(() => result.current.setClarity(2.4));
    expect(result.current.params.clarity).toBe(1.6);
    expect(result.current.activePresetId).toBeNull();

    act(() => result.current.setClarity(-1));
    expect(result.current.params.clarity).toBe(0);
    act(() => result.current.setLevels(140));
    expect(result.current.params.levels).toBe(100);
    act(() => result.current.setLevels(-5));
    expect(result.current.params.levels).toBe(0);
    act(() => result.current.setFolds(9.4));
    expect(result.current.params.folds).toBe(4);
    act(() => result.current.setRamp('deep'));
    expect(result.current.params.rampId).toBe('deep');
  });

  it('gives a mask shape a default feather and clears the mask for "none"', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setMaskShape('oval'));
    expect(result.current.params.mask.shape).toBe('oval');
    expect(result.current.params.mask.feather).toBeGreaterThan(0);

    act(() => result.current.setMaskShape('none'));
    expect(result.current.params.mask).toMatchObject({ shape: 'none', feather: 0, choke: 0 });
  });

  it('toggles shimmer and the original view', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShimmering(false));
    expect(result.current.isShimmering).toBe(false);
    act(() => result.current.setShowingOriginal(true));
    expect(result.current.isShowingOriginal).toBe(true);
  });

  it('downloads the gilded PNG and resets the busy flag', async () => {
    io.loadRgbaImage.mockResolvedValue(portraitPixels());
    io.downloadGildedPng.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(portraitFile('daisy.png'));
    });

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(io.downloadGildedPng).toHaveBeenCalledWith(expect.objectContaining({ width: 4 }), 'daisy.png');
    expect(result.current.isExporting).toBe(false);
  });

  it('names an unnamed download after the feature', async () => {
    io.loadRgbaImage.mockResolvedValue(portraitPixels());
    io.downloadGildedPng.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(portraitFile(''));
    });
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(io.downloadGildedPng).toHaveBeenCalledWith(expect.anything(), 'gilded-portrait');
  });

  it('reports an export failure and does nothing without an image', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(io.downloadGildedPng).not.toHaveBeenCalled();

    io.loadRgbaImage.mockResolvedValue(portraitPixels());
    await act(async () => {
      await result.current.loadFile(portraitFile());
    });
    io.downloadGildedPng.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.error).toMatch(/could not be prepared/);
    expect(result.current.isExporting).toBe(false);
  });

  it('returns to the gilded view after loading a new photograph', async () => {
    io.loadRgbaImage.mockResolvedValue(portraitPixels());
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShowingOriginal(true));
    await act(async () => {
      await result.current.loadFile(portraitFile());
    });
    await waitFor(() => expect(result.current.isShowingOriginal).toBe(false));
  });
});
