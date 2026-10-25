// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { type GildingPreset } from './types';

import { GILDING_PRESETS } from './presets';

import { useGildedPortrait } from './useGildedPortrait';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

setupDomTests();
const download = vi.hoisted(() => ({ downloadGildedPng: vi.fn() }));
vi.mock('./export', () => download);
const file = (name = 'portrait.png', type = 'image/png', size = 4096) => {
  const blob = new File(['x'], name, { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
};
function mount() {
  return renderHook(() => useGildedPortrait());
}
/** Resolves the currently pending `createImageBitmap` call by hand. */
function deferredBitmap(width = 4, height = 3) {
  const pending: Array<{ resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void }> = [];
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(
      () =>
        new Promise<ImageBitmap>((resolve, reject) => {
          pending.push({ resolve, reject });
        })
    )
  );
  return {
    pending,
    settle: async (index = pending.length - 1) => {
      pending[index].resolve({ width, height, close: vi.fn() } as unknown as ImageBitmap);
      await Promise.resolve();
    },
  };
}
beforeEach(() => {
  installCanvas2d();
  download.downloadGildedPng.mockReset();
  download.downloadGildedPng.mockResolvedValue(undefined);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4, height: 3, close: vi.fn() })));
});
describe('useGildedPortrait initial state', () => {
  it('starts on the first preset with nothing loaded', () => {
    const { result } = mount();

    expect(result.current.sourceImage).toBeNull();
    expect(result.current.gildedImage).toBeNull();
    expect(result.current.sourceName).toBe('');
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[0].id);
    expect(result.current.params).toEqual(GILDING_PRESETS[0].params);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isExporting).toBe(false);
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isShowingOriginal).toBe(false);
  });
});
describe('loading a portrait', () => {
  it('ignores an empty selection', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(null);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.sourceImage).toBeNull();
  });

  it('gilds the accepted file and reports its name', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('gala.png'));
    });

    expect(result.current.sourceName).toBe('gala.png');
    expect(result.current.sourceImage).toMatchObject({ width: 4, height: 3 });
    expect(result.current.gildedImage).toMatchObject({ width: 4, height: 3 });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('rejects unsupported types before touching the decoder', async () => {
    const { result } = mount();
    const decoder = vi.mocked(createImageBitmap);

    await act(async () => {
      await result.current.loadFile(file('notes.txt', 'text/plain'));
    });

    expect(result.current.error).toMatch(/Choose an image file/);
    expect(decoder).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('explains an HEIC rejection', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('iphone.heic', 'image/heic'));
    });

    expect(result.current.error).toMatch(/HEIC photos are not supported/);
  });

  it('surfaces a decode failure', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('corrupt'))));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('broken.png'));
    });

    expect(result.current.error).toBe(
      'That image could not be opened. Try a different PNG, JPEG, or WebP file.'
    );
    expect(result.current.sourceImage).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('drops a superseded load so the newest photo wins', async () => {
    const decoder = deferredBitmap(8, 8);
    const { result } = mount();

    let first: Promise<void>;
    let second: Promise<void>;
    await act(async () => {
      first = result.current.loadFile(file('old.png'));
      second = result.current.loadFile(file('new.png'));
    });

    await act(async () => {
      decoder.pending[1].resolve({ width: 4, height: 4, close: vi.fn() } as unknown as ImageBitmap);
      await second!;
      decoder.pending[0].resolve({ width: 8, height: 8, close: vi.fn() } as unknown as ImageBitmap);
      await first!;
    });

    expect(result.current.sourceName).toBe('new.png');
    expect(result.current.sourceImage).toMatchObject({ width: 4, height: 4 });
  });

  it('clears the original-preview toggle once a new photo lands', async () => {
    const { result } = mount();

    act(() => result.current.setShowingOriginal(true));
    expect(result.current.isShowingOriginal).toBe(true);

    await act(async () => {
      await result.current.loadFile(file('next.png'));
    });

    expect(result.current.isShowingOriginal).toBe(false);
  });
});
describe('gilding controls', () => {
  it('switches preset and remembers which one is active', () => {
    const { result } = mount();
    const preset = GILDING_PRESETS[1] as GildingPreset;

    act(() => result.current.applyPreset(preset));

    expect(result.current.activePresetId).toBe(preset.id);
    expect(result.current.params).toEqual(preset.params);
  });

  it('clamps clarity to 0..1.6 and drops the preset badge', () => {
    const { result } = mount();

    act(() => result.current.setClarity(5));
    expect(result.current.params.clarity).toBe(1.6);
    expect(result.current.activePresetId).toBeNull();

    act(() => result.current.setClarity(-2));
    expect(result.current.params.clarity).toBe(0);
  });

  it('clamps levels to 0..100', () => {
    const { result } = mount();

    act(() => result.current.setLevels(400));
    expect(result.current.params.levels).toBe(100);

    act(() => result.current.setLevels(-5));
    expect(result.current.params.levels).toBe(0);
  });

  it('rounds and clamps folds to 0..4', () => {
    const { result } = mount();

    act(() => result.current.setFolds(2.6));
    expect(result.current.params.folds).toBe(3);

    act(() => result.current.setFolds(9));
    expect(result.current.params.folds).toBe(4);

    act(() => result.current.setFolds(-1));
    expect(result.current.params.folds).toBe(0);
  });

  it('swaps the gold ramp', () => {
    const { result } = mount();

    act(() => result.current.setRamp('deep'));

    expect(result.current.params.rampId).toBe('deep');
  });

  it('zeroes feather and choke when the mask is removed', () => {
    const { result } = mount();

    act(() => result.current.setMaskShape('oval'));
    const feathered = result.current.params.mask.feather;
    expect(feathered).toBeGreaterThan(0);

    act(() => result.current.setMaskShape('none'));
    expect(result.current.params.mask).toMatchObject({ shape: 'none', feather: 0, choke: 0 });
  });

  it('restores a default feather when a mask is re-applied', () => {
    const { result } = mount();

    act(() => result.current.setMaskShape('none'));
    act(() => result.current.setMaskShape('rounded-rect'));

    expect(result.current.params.mask.shape).toBe('rounded-rect');
    expect(result.current.params.mask.feather).toBeCloseTo(0.06, 6);
  });
});
describe('PNG export', () => {
  const load = async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.loadFile(file('gala.png'));
    });
    return result;
  };

  it('does nothing before a portrait exists', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(download.downloadGildedPng).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('exports the gilded image under the source name', async () => {
    const result = await load();

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(download.downloadGildedPng).toHaveBeenCalledWith(
      expect.objectContaining({ width: 4, height: 3 }),
      'gala.png'
    );
    expect(result.current.isExporting).toBe(false);
  });

  it('falls back to the feature stem when no name is known', async () => {
    const { result } = mount();
    // Seed an image without going through the name-capturing load path.
    await act(async () => {
      await result.current.loadFile(file(''));
    });

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(download.downloadGildedPng).toHaveBeenCalledWith(expect.anything(), 'gilded-portrait');
  });

  it('reports a failed export and clears the busy flag', async () => {
    download.downloadGildedPng.mockRejectedValue(new Error('offline'));
    const result = await load();

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(result.current.error).toBe(
      'The PNG could not be prepared. Please try downloading again.'
    );
    expect(result.current.isExporting).toBe(false);
  });

  it('ignores a second click while exporting', async () => {
    const result = await load();
    let release: () => void = () => {};
    download.downloadGildedPng.mockImplementation(
      () => new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    let pending: Promise<void>;
    act(() => {
      pending = result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(download.downloadGildedPng).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await pending!;
    });
    expect(result.current.isExporting).toBe(false);
  });
});
