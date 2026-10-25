// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import type { RgbaImage } from '@/shared/lib/raster';
import { composeLayers, emptySubject, subjectGildingParams } from './compose';
import { STAGE_HINTS, isStageBusy, nextStage, stageHint } from './stage';
import { usePhotoSession } from './hooks/usePhotoSession';
import { renderEnamelPanel } from '@/features/enamel-backdrop';
import { DEFAULT_BACKDROPS } from '@/features/enamel-backdrop';
import { GILDING_PRESETS } from '@/features/gilded-portrait';

const deps = vi.hoisted(() => ({
  loadRgbaImage: vi.fn(),
  locateFace: vi.fn(),
  segmentSubject: vi.fn(),
}));

vi.mock('@/features/gilded-portrait', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/gilded-portrait')>()),
  loadRgbaImage: deps.loadRgbaImage,
}));

vi.mock('@/features/face-detection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/face-detection')>()),
  locateFace: deps.locateFace,
  warmUpFaceLocator: () => undefined,
}));

vi.mock('@/features/background-removal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/background-removal')>()),
  segmentSubject: deps.segmentSubject,
  warmUpSegmenter: () => undefined,
}));

const PHOTO: RgbaImage = buildHawkerFrame();

beforeEach(() => {
  deps.loadRgbaImage.mockResolvedValue(PHOTO);
  deps.locateFace.mockResolvedValue({ x: 8, y: 4, size: 40 });
  deps.segmentSubject.mockResolvedValue(buildHawkerMatte());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('stage facts', () => {
  it('reports busy only while a detector is working', () => {
    expect(isStageBusy('working')).toBe(true);
    expect(isStageBusy('refining')).toBe(true);
    for (const stage of ['idle', 'ready', 'plain', 'cropping', 'failed'] as const) {
      expect(isStageBusy(stage)).toBe(false);
    }
  });

  it('has a hint for every stage', () => {
    for (const [stage, hint] of Object.entries(STAGE_HINTS)) {
      expect(stageHint(stage as keyof typeof STAGE_HINTS)).toBe(hint);
    }
  });

  it('keeps an error above every other fact', () => {
    expect(
      nextStage({ hasImage: true, isLocating: true, isSegmenting: true, crop: null, matte: null, error: 'bad' })
    ).toBe('failed');
  });
});

describe('composeLayers guards', () => {
  it('refuses layers that are not the same square', () => {
    const backdrop = renderEnamelPanel(DEFAULT_BACKDROPS[0].spec, 8);
    const subject = emptySubject(4);
    expect(() =>
      composeLayers({
        subject,
        backdrop,
        frame: 'medallion',
        rampId: 'bright',
      })
    ).toThrow(/share one square size/);
  });

  it('gilds the whole cut-out instead of the portrait oval', () => {
    const params = GILDING_PRESETS[0].params;
    const forSubject = subjectGildingParams(params);
    expect(forSubject.mask).toEqual({ shape: 'none', feather: 0, choke: 0 });
    expect(forSubject.clarity).toBe(params.clarity);
    expect(params.mask.shape).toBe('none'); // the preset itself has no oval either
  });
});

describe('session while detectors are still running', () => {
  it('reports the cut-out as pending until the matte arrives', async () => {
    let releaseMatte: (matte: ReturnType<typeof buildHawkerMatte>) => void = () => undefined;
    deps.segmentSubject.mockReturnValueOnce(new Promise((resolve) => {
      releaseMatte = resolve;
    }));

    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'nick.png', { type: 'image/png' }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.photo).not.toBeNull();
    expect(result.current.cutOut).toBe('pending');
    expect(result.current.stage).toBe('refining');

    await act(async () => {
      releaseMatte(buildHawkerMatte());
      await Promise.resolve();
    });
    expect(result.current.cutOut).toBe('available');
  });

  it('drops a photo that finishes loading after the session was cancelled', async () => {
    let releasePhoto: (photo: RgbaImage) => void = () => undefined;
    deps.loadRgbaImage.mockReturnValueOnce(new Promise((resolve) => {
      releasePhoto = resolve;
    }));

    const { result } = renderHook(() => usePhotoSession());
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.loadFile(new File(['x'], 'nick.png', { type: 'image/png' }));
    });
    act(() => result.current.cancel());
    await act(async () => {
      releasePhoto(PHOTO);
      await pending;
    });
    expect(result.current.photo).toBeNull();
    expect(result.current.stage).toBe('idle');
  });
});

describe('usePhotoSession guards', () => {
  function deferred<T>() {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('reports a non-Error rejection in plain words', async () => {
    deps.loadRgbaImage.mockRejectedValueOnce('nope');
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'photo.png', { type: 'image/png' }));
    });
    expect(result.current.error).toBe('That image could not be opened.');
  });

  it('drops a matte that arrives after the session was cleared', async () => {
    const matte = deferred<never>();
    deps.segmentSubject.mockReturnValueOnce(matte.promise);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'photo.png', { type: 'image/png' }));
    });
    act(() => result.current.cancel());
    await act(async () => {
      matte.resolve(buildHawkerMatte() as never);
      await Promise.resolve();
    });
    // The cancelled session must not come back to life.
    expect(result.current.photo).toBeNull();
    expect(result.current.matte).toBeNull();
  });

  it('drops a load error that belongs to an older session', async () => {
    let failSlow: (reason: Error) => void = () => undefined;
    deps.loadRgbaImage.mockReturnValueOnce(
      new Promise<RgbaImage>((_resolve, reject) => {
        failSlow = reject;
      })
    );
    const { result } = renderHook(() => usePhotoSession());
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadFile(new File(['a'], 'slow.png', { type: 'image/png' }));
    });
    act(() => result.current.cancel());
    await act(async () => {
      failSlow(new Error('decode failed'));
      await first;
    });
    // The stale failure belongs to a session the curator already cleared.
    expect(result.current.error).toBeNull();
  });

  it('assumes a JPEG when a fetched sample has no type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: '' }) })));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample({ name: 'Wei Ling', src: '/sample.jpg' } as never);
    });
    expect(result.current.photoName).toBe('Wei Ling.jpg');
    vi.unstubAllGlobals();
  });

  it('cancels the whole session when cancel is pressed outside the crop box', () => {
    const { result } = renderHook(() => usePhotoSession());
    act(() => result.current.startAdjusting());
    act(() => result.current.cancelCrop());
    expect(result.current.isCropping).toBe(false);
    act(() => result.current.cancelCrop());
    // The second press falls through to a full cancel, which clears any error too.
    expect(result.current.stage).toBe('idle');
  });
});
