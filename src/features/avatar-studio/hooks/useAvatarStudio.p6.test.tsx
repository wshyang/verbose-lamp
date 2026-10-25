// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { WEI_LING } from '../data/samples';

import { useAvatarStudio } from './useAvatarStudio';

import { setupDomTests } from '@/test/dom';

setupDomTests();
/**
 * `useAvatarStudio` is the wiring layer between the session, the look, the raster
 * compose step and the PNG writer. Compositing at 512² is far too heavy to run for
 * every assertion, so the four collaborators are doubled while the memo boundaries,
 * the download guards and the sample shortcut run for real.
 */
const studio = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  look: {} as Record<string, unknown>,
  compose: {
    cutOutSubject: vi.fn((_input: unknown) => ({ layer: 'subject' })),
    emptySubject: vi.fn((_size: number) => ({ layer: 'empty' })),
    composeLayers: vi.fn((_input: unknown) => ({ image: { width: 4, height: 4 }, metal: null })),
  },
  renderEnamelPanel: vi.fn((_spec: unknown, _size: number) => ({ layer: 'backdrop' })),
  shimmerFrames: vi.fn(() => [{ frame: 1 }, { frame: 2 }]),
  downloadGildedPng: vi.fn(),
  loadSample: vi.fn(),
  applySampleDefaults: vi.fn(),
}));
vi.mock('../compose', () => ({
  AVATAR_SIZE: 4,
  cutOutSubject: studio.compose.cutOutSubject,
  emptySubject: studio.compose.emptySubject,
  composeLayers: studio.compose.composeLayers,
}));
vi.mock('@/features/enamel-backdrop', () => ({ renderEnamelPanel: studio.renderEnamelPanel }));
vi.mock('@/features/gilded-portrait', () => ({ downloadGildedPng: studio.downloadGildedPng }));
vi.mock('./useShimmerFrames', () => ({ useShimmerFrames: () => studio.shimmerFrames() }));
vi.mock('./usePhotoSession', () => ({ usePhotoSession: () => studio.session }));
vi.mock('./useAvatarLook', () => ({ useAvatarLook: () => studio.look }));
const photo = { width: 200, height: 160, data: new Uint8ClampedArray(4) };
const crop = { x: 0, y: 0, size: 120 };
const matte = { width: 200, height: 160, data: new Uint8ClampedArray(4) };
const defaultLook = () => ({
  isShimmering: true,
  tuning: { edge: 0 },
  finish: 'natural',
  gilding: { clarity: 1 },
  frame: 'medallion',
  backdrop: { rampId: 'bright' },
  applySampleDefaults: studio.applySampleDefaults,
});
beforeEach(() => {
  vi.clearAllMocks();
  studio.session = {
    photo,
    crop,
    matte,
    isCropping: false,
    photoName: 'gala.png',
    loadSample: studio.loadSample,
  };
  studio.look = defaultLook();
  studio.downloadGildedPng.mockResolvedValue(undefined);
});
describe('composition', () => {
  it('cuts the subject out and composites it over the enamel panel', () => {
    const { result } = renderHook(() => useAvatarStudio());

    expect(studio.compose.cutOutSubject).toHaveBeenCalledWith({
      photo,
      crop,
      matte,
      tuning: studio.look.tuning,
      finish: 'natural',
      gilding: studio.look.gilding,
      size: 4,
    });
    expect(studio.renderEnamelPanel).toHaveBeenCalledWith(studio.look.backdrop, 4);
    expect(studio.compose.composeLayers).toHaveBeenCalledWith({
      subject: { layer: 'subject' },
      backdrop: { layer: 'backdrop' },
      frame: 'medallion',
      rampId: 'bright',
    });
    expect(result.current.canDownload).toBe(true);
    expect(result.current.avatar).toEqual({ image: { width: 4, height: 4 }, metal: null });
  });

  it('uses an empty subject until a crop exists', () => {
    studio.session = { ...studio.session, photo: null, crop: null, matte: null };
    const { result } = renderHook(() => useAvatarStudio());

    expect(studio.compose.emptySubject).toHaveBeenCalledWith(4);
    expect(studio.compose.cutOutSubject).not.toHaveBeenCalled();
    expect(result.current.canDownload).toBe(false);
  });

  it('re-renders the backdrop alone when only the look changes', () => {
    const { rerender } = renderHook(() => useAvatarStudio());
    const cutOutCalls = studio.compose.cutOutSubject.mock.calls.length;

    studio.look = { ...studio.look, backdrop: { rampId: 'deep' } };
    rerender();

    expect(studio.renderEnamelPanel).toHaveBeenCalledTimes(2);
    expect(studio.compose.cutOutSubject).toHaveBeenCalledTimes(cutOutCalls);
    expect(studio.compose.composeLayers).toHaveBeenLastCalledWith(
      expect.objectContaining({ rampId: 'deep' })
    );
  });

  it('redoes the cut-out when a tuning knob moves', () => {
    const { rerender } = renderHook(() => useAvatarStudio());

    studio.look = { ...studio.look, tuning: { edge: 1 } };
    rerender();

    expect(studio.compose.cutOutSubject).toHaveBeenCalledTimes(2);
    expect(studio.compose.cutOutSubject).toHaveBeenLastCalledWith(
      expect.objectContaining({ tuning: { edge: 1 } })
    );
  });

  it('hides download while the square is being adjusted', () => {
    studio.session = { ...studio.session, isCropping: true };
    const { result } = renderHook(() => useAvatarStudio());

    expect(result.current.canDownload).toBe(false);
  });

  it('exposes the shimmer frames from the preview hook', () => {
    const { result } = renderHook(() => useAvatarStudio());

    expect(result.current.previewFrames).toEqual([{ frame: 1 }, { frame: 2 }]);
  });
});
describe('PNG export', () => {
  it('does nothing while no finished portrait exists', async () => {
    studio.session = { ...studio.session, crop: null };
    const { result } = renderHook(() => useAvatarStudio());

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(studio.downloadGildedPng).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('writes the composed image under the source stem', async () => {
    const { result } = renderHook(() => useAvatarStudio());

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(studio.downloadGildedPng).toHaveBeenCalledWith(
      { width: 4, height: 4 },
      'gala-gilded-avatar'
    );
    expect(result.current.isExporting).toBe(false);
    expect(result.current.exportError).toBeNull();
  });

  it('falls back to a plain stem when the photo has no name', async () => {
    studio.session = { ...studio.session, photoName: '' };
    const { result } = renderHook(() => useAvatarStudio());

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(studio.downloadGildedPng).toHaveBeenCalledWith(expect.anything(), 'portrait-gilded-avatar');
  });

  it('reports a failed write and clears the busy flag', async () => {
    studio.downloadGildedPng.mockRejectedValue(new Error('quota'));
    const { result } = renderHook(() => useAvatarStudio());

    await act(async () => {
      await result.current.downloadPng();
    });

    expect(result.current.exportError).toBe('The PNG could not be prepared. Please try again.');
    expect(result.current.isExporting).toBe(false);
  });

  it('ignores a second click while the first is still running', async () => {
    let release: () => void = () => {};
    studio.downloadGildedPng.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const { result } = renderHook(() => useAvatarStudio());

    let pending: Promise<void>;
    act(() => {
      pending = result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(studio.downloadGildedPng).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await pending!;
    });
    expect(result.current.isExporting).toBe(false);
  });
});
describe('the Wei_Ling shortcut', () => {
  it('resets the look and loads the bundled sample', () => {
    const { result } = renderHook(() => useAvatarStudio());

    act(() => result.current.showWeiLing());

    expect(studio.applySampleDefaults).toHaveBeenCalledTimes(1);
    expect(studio.loadSample).toHaveBeenCalledWith(WEI_LING);
  });
});
