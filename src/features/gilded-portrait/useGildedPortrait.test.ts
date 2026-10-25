// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GILDING_PRESETS } from './presets';
import { useGildedPortrait } from './useGildedPortrait';

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void; reject: (e?: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  return { promise: new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }), resolve, reject };
}

const SOURCE = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
const GILDED = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(9) };

const mocks = vi.hoisted(() => ({
  validateImageFile: vi.fn(),
  loadRgbaImage: vi.fn(),
  gildImage: vi.fn(),
  downloadGildedPng: vi.fn(),
}));

vi.mock('./validate', () => ({ validateImageFile: mocks.validateImageFile }));
vi.mock('./load', () => ({ loadRgbaImage: mocks.loadRgbaImage }));
vi.mock('./pipeline', () => ({ gildImage: mocks.gildImage }));
vi.mock('./export', () => ({ downloadGildedPng: mocks.downloadGildedPng }));

const makeFile = (name = 'sitter.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateImageFile.mockReturnValue({ ok: true });
  mocks.loadRgbaImage.mockResolvedValue(SOURCE);
  mocks.gildImage.mockReturnValue(GILDED);
  mocks.downloadGildedPng.mockResolvedValue(undefined);
});

describe('useGildedPortrait controls', () => {
  it('starts on the first preset, clamps all numeric controls, and clears preset on edits', () => {
    const { result } = renderHook(() => useGildedPortrait());
    expect(result.current).toMatchObject({
      params: GILDING_PRESETS[0].params, activePresetId: GILDING_PRESETS[0].id, gildedImage: null,
    });
    act(() => result.current.setClarity(-1));
    expect(result.current.params.clarity).toBe(0);
    act(() => result.current.setClarity(9));
    act(() => result.current.setLevels(-5));
    expect(result.current.params).toMatchObject({ clarity: 1.6, levels: 0 });
    act(() => result.current.setLevels(101));
    act(() => result.current.setFolds(3.6));
    expect(result.current.params).toMatchObject({ levels: 100, folds: 4 });
    act(() => result.current.setFolds(-2));
    act(() => result.current.setRamp('deep'));
    expect(result.current.params).toMatchObject({ folds: 0, rampId: 'deep' });
    expect(result.current.activePresetId).toBeNull();
    act(() => result.current.applyPreset(GILDING_PRESETS[1]));
    expect(result.current.activePresetId).toBe(GILDING_PRESETS[1].id);
  });

  it('sets mask defaults only for shaped masks and preserves existing feather/choke', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setMaskShape('oval'));
    expect(result.current.params.mask).toEqual({ shape: 'oval', feather: 0.06, choke: 0 });
    act(() => result.current.applyPreset(GILDING_PRESETS[1])); // feather .08, choke 1
    act(() => result.current.setMaskShape('rounded-rect'));
    expect(result.current.params.mask).toEqual({ shape: 'rounded-rect', feather: 0.08, choke: 1 });
    act(() => result.current.setMaskShape('none'));
    expect(result.current.params.mask).toEqual({ shape: 'none', feather: 0, choke: 0 });
  });

  it('updates shimmering and original-preview toggles', () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShimmering(false));
    act(() => result.current.setShowingOriginal(true));
    expect(result.current).toMatchObject({ isShimmering: false, isShowingOriginal: true });
  });
});

describe('useGildedPortrait loading', () => {
  it('ignores null, invalid, and failed files with useful errors', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => result.current.loadFile(null));
    mocks.validateImageFile.mockReturnValueOnce({ ok: false, reason: 'Too large' });
    await act(async () => result.current.loadFile(makeFile()));
    expect(result.current).toMatchObject({ error: 'Too large', isLoading: false });

    mocks.loadRgbaImage.mockRejectedValueOnce(new Error('Broken image'));
    await act(async () => result.current.loadFile(makeFile()));
    expect(result.current.error).toBe('Broken image');
    mocks.loadRgbaImage.mockRejectedValueOnce('bad');
    await act(async () => result.current.loadFile(makeFile()));
    expect(result.current.error).toBe('That image could not be opened.');
  });

  it('loads the current file, gilds it, and leaves original view off', async () => {
    const pending = deferred<typeof SOURCE>();
    mocks.loadRgbaImage.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShowingOriginal(true));
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadFile(makeFile('hero.png')); });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      pending.resolve(SOURCE);
      await loading;
    });
    expect(result.current).toMatchObject({
      sourceImage: SOURCE, gildedImage: GILDED, sourceName: 'hero.png', isLoading: false, isShowingOriginal: false,
    });
    expect(mocks.gildImage).toHaveBeenCalledWith(SOURCE, result.current.params);
  });

  it('drops stale successes and failures without clearing the newer loading state', async () => {
    const first = deferred<typeof SOURCE>();
    const second = deferred<typeof SOURCE>();
    mocks.loadRgbaImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useGildedPortrait());
    let one!: Promise<void>;
    let two!: Promise<void>;
    act(() => { one = result.current.loadFile(makeFile('one.jpg')); });
    act(() => { two = result.current.loadFile(makeFile('two.jpg')); });
    await act(async () => {
      first.resolve({ ...SOURCE, width: 99 });
      await one;
    });
    expect(result.current).toMatchObject({ sourceImage: null, isLoading: true });
    await act(async () => {
      second.resolve(SOURCE);
      await two;
    });
    expect(result.current.sourceName).toBe('two.jpg');

    const third = deferred<typeof SOURCE>();
    const fourth = deferred<typeof SOURCE>();
    mocks.loadRgbaImage.mockReturnValueOnce(third.promise).mockReturnValueOnce(fourth.promise);
    act(() => { one = result.current.loadFile(makeFile('three.jpg')); });
    act(() => { two = result.current.loadFile(makeFile('four.jpg')); });
    await act(async () => {
      third.reject(new Error('stale'));
      await one;
    });
    expect(result.current.error).toBeNull();
    await act(async () => {
      fourth.resolve(SOURCE);
      await two;
    });
  });

  it('keeps original view unchanged for a null file', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    act(() => result.current.setShowingOriginal(true));
    await act(async () => result.current.loadFile(null));
    expect(result.current.isShowingOriginal).toBe(true);
  });
});

describe('useGildedPortrait downloads', () => {
  it('guards missing and parallel exports and reports failures', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => result.current.downloadPng());
    expect(mocks.downloadGildedPng).not.toHaveBeenCalled();
    await act(async () => result.current.loadFile(makeFile()));

    let finish!: () => void;
    mocks.downloadGildedPng.mockImplementation(() => new Promise<void>((done) => { finish = done; }));
    let downloading!: Promise<void>;
    act(() => { downloading = result.current.downloadPng(); });
    expect(result.current.isExporting).toBe(true);
    await act(async () => result.current.downloadPng());
    expect(mocks.downloadGildedPng).toHaveBeenCalledOnce();
    await act(async () => { finish(); await downloading; });
    expect(result.current.isExporting).toBe(false);

    mocks.downloadGildedPng.mockRejectedValue(new Error('no'));
    await act(async () => result.current.downloadPng());
    expect(result.current.error).toBe('The PNG could not be prepared. Please try downloading again.');
  });

  it('uses a fallback label for an unnamed loaded file', async () => {
    const { result } = renderHook(() => useGildedPortrait());
    await act(async () => result.current.loadFile(new File(['x'], '', { type: 'image/jpeg' })));
    await act(async () => result.current.downloadPng());
    expect(mocks.downloadGildedPng).toHaveBeenCalledWith(GILDED, 'gilded-portrait');
  });
});
