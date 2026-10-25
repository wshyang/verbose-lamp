// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ComposedAvatar } from '../types';
import { WEI_LING } from '../data/samples';
import { useAvatarStudio } from './useAvatarStudio';

const deps = vi.hoisted(() => ({
  session: {
    photo: null as unknown,
    crop: null as unknown,
    matte: null as unknown,
    photoName: '',
    isCropping: false,
    applySampleDefaults: vi.fn(),
    loadSample: vi.fn(),
  },
  look: {
    tuning: { removeBackground: true, threshold: 30, minIsland: 2, edge: 0 },
    finish: 'natural' as const,
    gilding: { rampId: 'bright' },
    frame: 'medallion' as const,
    backdrop: { rampId: 'bright' },
    isShimmering: true,
    applySampleDefaults: vi.fn(),
  },
  downloadGildedPng: vi.fn(async () => undefined),
  renderEnamelPanel: vi.fn(() => ({ image: { width: 2, height: 2, data: new Uint8ClampedArray(16) } })),
}));

vi.mock('./usePhotoSession', () => ({
  usePhotoSession: () => ({
    ...deps.session,
    applySampleDefaults: undefined,
    loadSample: deps.session.loadSample,
  }),
}));

vi.mock('./useAvatarLook', () => ({
  useAvatarLook: () => ({
    ...deps.look,
    isFineTuning: false,
    applySampleDefaults: deps.look.applySampleDefaults,
  }),
}));

vi.mock('./useShimmerFrames', () => ({
  useShimmerFrames: (avatar: ComposedAvatar) => [avatar.image],
}));

vi.mock('@/features/enamel-backdrop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/enamel-backdrop')>();
  return { ...actual, renderEnamelPanel: deps.renderEnamelPanel };
});

vi.mock('@/features/gilded-portrait', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/gilded-portrait')>();
  return { ...actual, downloadGildedPng: deps.downloadGildedPng };
});

vi.mock('../compose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compose')>();
  const image = (size: number) => ({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4) });
  return {
    ...actual,
    cutOutSubject: vi.fn(() => ({ pixels: image(8), alpha: { width: 8, height: 8, data: new Uint8ClampedArray(64) }, shine: 1 })),
    emptySubject: vi.fn(() => ({ pixels: image(8), alpha: { width: 8, height: 8, data: new Uint8ClampedArray(64) }, shine: 1 })),
    composeLayers: vi.fn(() => ({
      image: image(4),
      metal: { width: 4, height: 4, data: new Uint8ClampedArray(16) },
    })),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  deps.session.photo = null;
  deps.session.crop = null;
  deps.session.isCropping = false;
  deps.session.photoName = '';
});

describe('useAvatarStudio', () => {
  it('composes an empty avatar before a photo arrives', () => {
    const { result } = renderHook(() => useAvatarStudio());
    expect(result.current.canDownload).toBe(false);
    expect(result.current.avatar.image.width).toBe(4);
    expect(result.current.previewFrames).toHaveLength(1);
    expect(result.current.exportError).toBeNull();
    expect(deps.renderEnamelPanel).toHaveBeenCalled();
  });

  it('allows a download once a photo and a crop exist', async () => {
    deps.session.photo = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    deps.session.crop = { x: 0, y: 0, size: 8 };
    deps.session.photoName = 'daisy.png';
    const { result } = renderHook(() => useAvatarStudio());
    expect(result.current.canDownload).toBe(true);

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).toHaveBeenCalledWith(expect.objectContaining({ width: 4 }), 'daisy-gilded-avatar');
    expect(result.current.isExporting).toBe(false);
  });

  it('falls back to a plain stem when the photo has no name', async () => {
    deps.session.photo = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    deps.session.crop = { x: 0, y: 0, size: 8 };
    const { result } = renderHook(() => useAvatarStudio());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).toHaveBeenCalledWith(expect.anything(), 'portrait-gilded-avatar');
  });

  it('refuses to download while cropping or with nothing loaded', async () => {
    const { result } = renderHook(() => useAvatarStudio());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).not.toHaveBeenCalled();

    deps.session.photo = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    deps.session.crop = { x: 0, y: 0, size: 8 };
    deps.session.isCropping = true;
    const second = renderHook(() => useAvatarStudio());
    await act(async () => {
      await second.result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).not.toHaveBeenCalled();
  });

  it('reports a failed export', async () => {
    deps.session.photo = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    deps.session.crop = { x: 0, y: 0, size: 8 };
    deps.downloadGildedPng.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useAvatarStudio());
    await act(async () => {
      await result.current.downloadPng();
    });
    await waitFor(() => expect(result.current.exportError).toContain('could not be prepared'));
    expect(result.current.isExporting).toBe(false);
  });

  it('loads Wei_Ling with the studio defaults', () => {
    const { result } = renderHook(() => useAvatarStudio());
    act(() => result.current.showWeiLing());
    expect(deps.look.applySampleDefaults).toHaveBeenCalledTimes(1);
    expect(deps.session.loadSample).toHaveBeenCalledWith(WEI_LING);
  });
});
