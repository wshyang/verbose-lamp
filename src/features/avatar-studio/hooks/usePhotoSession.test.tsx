// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SquareBox } from '@/shared/lib/raster';
import type { RgbaImage } from '@/features/gilded-portrait';
import { usePhotoSession } from './usePhotoSession';

const env = vi.hoisted(() => ({
  loadRgbaImage: vi.fn(),
  validateImageFile: vi.fn(() => ({ ok: true as const })),
  locateFace: vi.fn(),
  segmentSubject: vi.fn(),
  warmUpFaceLocator: vi.fn(),
  warmUpSegmenter: vi.fn(),
}));

vi.mock('@/features/gilded-portrait', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/gilded-portrait')>();
  return { ...actual, loadRgbaImage: env.loadRgbaImage, validateImageFile: env.validateImageFile };
});

vi.mock('@/features/face-detection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/face-detection')>();
  return { ...actual, locateFace: env.locateFace, warmUpFaceLocator: env.warmUpFaceLocator };
});

vi.mock('@/features/background-removal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/background-removal')>();
  return { ...actual, segmentSubject: env.segmentSubject, warmUpSegmenter: env.warmUpSegmenter };
});

const photo: RgbaImage = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) };
const faceBox: SquareBox = { x: 8, y: 4, size: 20 };
const matte = { width: 40, height: 30, alpha: new Uint8ClampedArray(1200) } as never;

function file(name = 'daisy.png') {
  return new File([new Uint8Array([1])], name, { type: 'image/png' });
}

function primeHappyPath() {
  env.loadRgbaImage.mockResolvedValue(photo);
  env.locateFace.mockResolvedValue(faceBox);
  env.segmentSubject.mockResolvedValue(matte);
}

afterEach(() => {
  vi.clearAllMocks();
  env.validateImageFile.mockReturnValue({ ok: true });
});

describe('usePhotoSession', () => {
  it('warms the detectors on mount and cleans up on unmount', () => {
    const { unmount } = renderHook(() => usePhotoSession());
    expect(env.warmUpFaceLocator).toHaveBeenCalledTimes(1);
    expect(env.warmUpSegmenter).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('opens on the idle stage with no photo', () => {
    const { result } = renderHook(() => usePhotoSession());
    expect(result.current.stage).toBe('idle');
    expect(result.current.hint).toContain('Choose a portrait');
    expect(result.current.cutOut).toBe('available');
    expect(result.current.cropperStart).toBeNull();
    expect(result.current.isCropping).toBe(false);
    expect(result.current.photoName).toBe('');
  });

  it('ignores an empty selection', async () => {
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(null);
    });
    expect(env.loadRgbaImage).not.toHaveBeenCalled();
    expect(result.current.stage).toBe('idle');
  });

  it('reports a rejected file and a failed decode', async () => {
    env.validateImageFile.mockReturnValueOnce({ ok: false, reason: 'Use a PNG or JPEG.' } as never);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toBe('Use a PNG or JPEG.');
    expect(result.current.photo).toBeNull();

    env.loadRgbaImage.mockRejectedValueOnce(new Error('decode failed'));
    await act(async () => {
      await result.current.loadFile(file());
    });
    expect(result.current.error).toBe('decode failed');
    expect(result.current.stage).toBe('failed');

    env.loadRgbaImage.mockRejectedValueOnce('not an error');
    await act(async () => {
      await result.current.loadFile(file());
    });
    expect(result.current.error).toBe('That image could not be opened.');
  });

  it('moves idle → working → ready once the face and matte arrive', async () => {
    primeHappyPath();
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file('daisy.png'));
    });
    await waitFor(() => expect(result.current.stage).toBe('ready'));

    expect(result.current.photoName).toBe('daisy.png');
    expect(result.current.crop).toEqual(faceBox);
    expect(result.current.foundCrop).toEqual(faceBox);
    expect(result.current.matte).toEqual(matte);
    expect(result.current.isLocating).toBe(false);
    expect(result.current.isSegmenting).toBe(false);
    expect(result.current.cutOut).toBe('available');
    expect(result.current.cropperStart).toEqual(faceBox);
    expect(result.current.isCropping).toBe(false);
    expect(result.current.hint).toContain('Background removed');
  });

  it('shows the plain stage when the background cannot be lifted', async () => {
    env.loadRgbaImage.mockResolvedValue(photo);
    env.locateFace.mockResolvedValue(faceBox);
    env.segmentSubject.mockResolvedValue(null);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    await waitFor(() => expect(result.current.stage).toBe('plain'));
    expect(result.current.cutOut).toBe('unavailable');
    expect(result.current.hint).toContain('could not be removed');
  });

  it('falls back to manual cropping when no face is found', async () => {
    env.loadRgbaImage.mockResolvedValue(photo);
    env.locateFace.mockResolvedValue(null);
    env.segmentSubject.mockResolvedValue(matte);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    await waitFor(() => expect(result.current.stage).toBe('cropping'));
    expect(result.current.hint).toContain('could not find a face');
    expect(result.current.crop).toBeNull();
    expect(result.current.cropperStart).toEqual({ x: 8, y: 3, size: 24 });
    expect(result.current.cutOut).toBe('available');

    act(() => result.current.startAdjusting());
    expect(result.current.isCropping).toBe(true);
    act(() => result.current.confirmCrop({ x: 2, y: 2, size: 16 }));
    expect(result.current.crop).toEqual({ x: 2, y: 2, size: 16 });
    expect(result.current.isCropping).toBe(false);
    expect(result.current.stage).toBe('ready');
  });

  it('reports a pending cut-out while the matte is still computing', async () => {
    env.loadRgbaImage.mockResolvedValue(photo);
    env.locateFace.mockResolvedValue(faceBox);
    let finish: (value: unknown) => void = () => {};
    env.segmentSubject.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    await waitFor(() => expect(result.current.isLocating).toBe(false));
    expect(result.current.stage).toBe('refining');
    expect(result.current.cutOut).toBe('pending');
    expect(result.current.hint).toContain('Lifting the background');

    await act(async () => {
      finish(matte);
    });
    await waitFor(() => expect(result.current.cutOut).toBe('available'));
  });

  it('drops a result that arrives after the session was cancelled', async () => {
    let finishLoad: (value: RgbaImage) => void = () => {};
    env.loadRgbaImage.mockImplementation(() => new Promise((resolve) => { finishLoad = resolve; }));
    const { result } = renderHook(() => usePhotoSession());
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.loadFile(file('stale.png'));
    });
    expect(result.current.stage).toBe('working');

    act(() => result.current.cancel());
    expect(result.current.stage).toBe('idle');
    expect(result.current.photoName).toBe('');

    await act(async () => {
      finishLoad(photo);
      await pending;
    });
    expect(result.current.photo).toBeNull();
  });

  it('cancels cropping when not adjusting, and stops adjusting when it is', async () => {
    primeHappyPath();
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    await waitFor(() => expect(result.current.crop).toEqual(faceBox));

    act(() => result.current.cancelCrop());
    expect(result.current.photo).toBeNull();
    expect(result.current.stage).toBe('idle');
  });

  it('loads a sample through fetch', async () => {
    primeHappyPath();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array([2])], { type: 'image/jpeg' }) })),
    );
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample({ id: 'wei-ling', name: 'Wei_Ling', persona: 'host', src: '/wei.jpg' });
    });
    await waitFor(() => expect(result.current.photo).not.toBeNull());
    expect(result.current.photoName).toBe('Wei_Ling.jpg');
    vi.unstubAllGlobals();
  });

  it('explains a sample that cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample({ id: 'wei-ling', name: 'Wei_Ling', persona: 'host', src: '/wei.jpg' });
    });
    expect(result.current.error).toBe("Wei_Ling's photo could not be opened.");
    expect(result.current.stage).toBe('failed');
    vi.unstubAllGlobals();
  });
  it('ignores detector results that land after the session was cancelled', async () => {
    let finishFace: (box: SquareBox | null) => void = () => {};
    let finishMatte: (value: unknown) => void = () => {};
    env.loadRgbaImage.mockResolvedValue(photo);
    env.locateFace.mockImplementation(() => new Promise((resolve) => { finishFace = resolve; }));
    env.segmentSubject.mockImplementation(() => new Promise((resolve) => { finishMatte = resolve; }));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file('stale-detectors.png'));
    });
    expect(result.current.isLocating).toBe(true);

    act(() => result.current.cancel());
    await act(async () => {
      finishFace(faceBox);
      finishMatte(matte);
      await Promise.resolve();
    });
    expect(result.current.crop).toBeNull();
    expect(result.current.matte).toBeNull();
    expect(result.current.stage).toBe('idle');
  });

  it('ignores a decode failure that arrives after the session was cancelled', async () => {
    let failLoad: (error: unknown) => void = () => {};
    env.loadRgbaImage.mockImplementation(() => new Promise((_, reject) => { failLoad = reject; }));
    const { result } = renderHook(() => usePhotoSession());
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.loadFile(file('late-failure.png'));
    });

    act(() => result.current.cancel());
    await act(async () => {
      failLoad(new Error('too late'));
      await pending;
    });
    expect(result.current.error).toBeNull();
    expect(result.current.stage).toBe('idle');
  });

  it('labels a sample without a MIME type as JPEG', async () => {
    primeHappyPath();
    const seen: File[] = [];
    env.loadRgbaImage.mockImplementation((received: File) => {
      seen.push(received);
      return Promise.resolve(photo);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array([3])]) })),
    );
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample({ id: 'wei-ling', name: 'Wei_Ling', persona: 'host', src: '/wei.jpg' });
    });
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0].type).toBe('image/jpeg');
    vi.unstubAllGlobals();
  });

  it('stops adjusting instead of discarding the photo', async () => {
    primeHappyPath();
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file());
    });
    await waitFor(() => expect(result.current.stage).toBe('ready'));

    act(() => result.current.startAdjusting());
    expect(result.current.isCropping).toBe(true);
    act(() => result.current.cancelCrop());
    expect(result.current.isCropping).toBe(false);
    expect(result.current.photo).not.toBeNull();
  });

  it('does not open the cropper while the face locator is still working', async () => {
    env.loadRgbaImage.mockResolvedValue(photo);
    env.locateFace.mockImplementation(() => new Promise(() => {}));
    env.segmentSubject.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(file('locating.png'));
    });
    act(() => result.current.startAdjusting());
    expect(result.current.isLocating).toBe(true);
    expect(result.current.isCropping).toBe(false);
  });
});
