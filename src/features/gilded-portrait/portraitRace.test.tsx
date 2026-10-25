// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RgbaImage } from '@/shared/lib/raster';

const loader = vi.hoisted(() => ({
  load: vi.fn<(file: File) => Promise<RgbaImage>>(),
  export: vi.fn(),
}));

vi.mock('./load', () => ({ loadRgbaImage: loader.load, MAX_GILDED_IMAGE_EDGE: 1024 }));
vi.mock('./export', () => ({ downloadGildedPng: loader.export }));

const { useGildedPortrait } = await import('./useGildedPortrait');

const IMAGE: RgbaImage = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4).fill(200) };

function png(name: string): File {
  return new File(['x'], name, { type: 'image/png' });
}

beforeEach(() => {
  loader.load.mockReset();
  loader.export.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGildedPortrait load ordering', () => {
  it('keeps the newest photo when an older decode finishes last', async () => {
    let releaseSlow: (image: RgbaImage) => void = () => undefined;
    loader.load
      .mockReturnValueOnce(new Promise<RgbaImage>((resolve) => {
        releaseSlow = resolve;
      }))
      .mockResolvedValueOnce(IMAGE);

    const { result } = renderHook(() => useGildedPortrait());
    let slow: Promise<void> = Promise.resolve();
    act(() => {
      slow = result.current.loadFile(png('slow.png'));
    });
    await act(async () => {
      await result.current.loadFile(png('fast.png'));
    });
    expect(result.current.sourceName).toBe('fast.png');

    await act(async () => {
      releaseSlow(IMAGE);
      await slow;
    });
    // The stale answer is dropped, so the newest photo is still the one shown.
    expect(result.current.sourceName).toBe('fast.png');
  });

  it('drops a failure that belongs to an older photo', async () => {
    let failSlow: (reason: Error) => void = () => undefined;
    loader.load
      .mockReturnValueOnce(new Promise<RgbaImage>((_resolve, reject) => {
        failSlow = reject;
      }))
      .mockResolvedValueOnce(IMAGE);

    const { result } = renderHook(() => useGildedPortrait());
    let slow: Promise<void> = Promise.resolve();
    act(() => {
      slow = result.current.loadFile(png('slow.png'));
    });
    await act(async () => {
      await result.current.loadFile(png('fast.png'));
    });

    await act(async () => {
      failSlow(new Error('slow decode failed'));
      await slow;
    });
    // The stale failure must not be shown against the newer photo.
    expect(result.current.error).toBeNull();
    expect(result.current.sourceName).toBe('fast.png');
  });

  it('falls back to a generic file stem when the photo has no name', async () => {
    loader.load.mockResolvedValueOnce(IMAGE);
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(png(''));
    });
    expect(result.current.sourceName).toBe('');
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(loader.export).toHaveBeenCalledWith(expect.anything(), 'gilded-portrait');
  });

  it('reports a non-Error rejection in plain words', async () => {
    loader.load.mockRejectedValueOnce('boom');
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(png('nick.png'));
    });
    expect(result.current.error).toBe('That image could not be opened.');
  });

  it('marks the export as finished even when the download fails', async () => {
    loader.load.mockResolvedValueOnce(IMAGE);
    loader.export.mockRejectedValueOnce(new Error('blocked'));
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => {
      await result.current.loadFile(png('nick.png'));
    });
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toContain('could not be prepared');
  });
});
