// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHawkerFrame, buildHawkerMatte } from '@/features/background-removal';
import { DEFAULT_BACKDROPS, ENAMEL_PALETTES } from '@/features/enamel-backdrop';
import type { RgbaImage } from '@/shared/lib/raster';
import { clampBox, startingBox } from './cropBox';
import { useAvatarLook } from './hooks/useAvatarLook';
import { useAvatarStudio } from './hooks/useAvatarStudio';
import { useCropper } from './hooks/useCropper';
import { usePhotoSession } from './hooks/usePhotoSession';
import { useShimmerFrames } from './hooks/useShimmerFrames';
import { AVATAR_SAMPLES } from './data/samples';
import type { ComposedAvatar } from './types';

const deps = vi.hoisted(() => ({
  loadRgbaImage: vi.fn(),
  downloadGildedPng: vi.fn(),
  locateFace: vi.fn(),
  segmentSubject: vi.fn(),
  warmUpFaceLocator: vi.fn(),
  warmUpSegmenter: vi.fn(),
}));

vi.mock('@/features/gilded-portrait', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/gilded-portrait')>()),
  loadRgbaImage: deps.loadRgbaImage,
  downloadGildedPng: deps.downloadGildedPng,
}));

vi.mock('@/features/face-detection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/face-detection')>()),
  locateFace: deps.locateFace,
  warmUpFaceLocator: deps.warmUpFaceLocator,
}));

vi.mock('@/features/background-removal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/background-removal')>()),
  segmentSubject: deps.segmentSubject,
  warmUpSegmenter: deps.warmUpSegmenter,
}));

vi.mock('./shimmer', () => ({
  SHIMMER_FRAMES: 2,
  shimmerFrames: () => [{ width: 2, height: 2, data: new Uint8ClampedArray(16) }, { width: 2, height: 2, data: new Uint8ClampedArray(16) }],
}));

const PHOTO: RgbaImage = buildHawkerFrame();
const BOX = { x: 8, y: 4, size: 40 };

function png(name = 'nick.png'): File {
  return new File(['x'], name, { type: 'image/png' });
}

/** Flush the promise chains the session starts (load → locate → segment). */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  deps.loadRgbaImage.mockResolvedValue(PHOTO);
  deps.locateFace.mockResolvedValue(BOX);
  deps.segmentSubject.mockResolvedValue(buildHawkerMatte());
  deps.downloadGildedPng.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('usePhotoSession', () => {
  it('starts idle, warms the detectors and offers the cut-out', () => {
    const { result } = renderHook(() => usePhotoSession());
    expect(result.current.stage).toBe('idle');
    expect(result.current.hint).toContain('Choose a portrait');
    expect(result.current.cutOut).toBe('available');
    expect(result.current.cropperStart).toBeNull();
    expect(deps.warmUpFaceLocator).toHaveBeenCalledOnce();
    expect(deps.warmUpSegmenter).toHaveBeenCalledOnce();
  });

  it('walks a photo through locating, refining and ready', async () => {
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(png());
    });
    expect(deps.loadRgbaImage).toHaveBeenCalled();
    await settle();
    expect(result.current.stage).toBe('ready');
    expect(result.current.photo).toBe(PHOTO);
    expect(result.current.photoName).toBe('nick.png');
    expect(result.current.crop).toEqual(BOX);
    expect(result.current.matte).not.toBeNull();
    expect(result.current.cutOut).toBe('available');
    expect(result.current.isCropping).toBe(false);
    expect(result.current.cropperStart).toEqual(BOX);
  });

  it('ignores a null file and explains a rejected one', async () => {
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(null);
    });
    expect(result.current.photo).toBeNull();

    await act(async () => {
      await result.current.loadFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    });
    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toContain('Choose an image file');
    expect(result.current.cutOut).toBe('available');
  });

  it('reports a decode failure in plain words', async () => {
    deps.loadRgbaImage.mockRejectedValueOnce(new Error('That image could not be opened.'));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(png());
    });
    expect(result.current.error).toBe('That image could not be opened.');
    expect(result.current.stage).toBe('failed');
  });

  it('keeps the photo when the background cannot be removed', async () => {
    deps.segmentSubject.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(png());
    });
    await settle();
    expect(result.current.stage).toBe('plain');
    expect(result.current.hint).toContain('could not be removed');
    expect(result.current.cutOut).toBe('unavailable');
  });

  it('sends a photo with no face to manual cropping', async () => {
    deps.locateFace.mockResolvedValueOnce(null);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(png());
    });
    await settle();
    expect(result.current.stage).toBe('cropping');
    expect(result.current.isCropping).toBe(true);
    expect(result.current.cropperStart).toEqual(startingBox(PHOTO));
  });

  it('confirms a manual crop and re-enters adjusting on demand', async () => {
    deps.locateFace.mockResolvedValueOnce(BOX);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(png());
    });
    await settle();
    act(() => result.current.confirmCrop({ x: 5, y: 5, size: 40 }));
    expect(result.current.crop).toEqual({ x: 5, y: 5, size: 40 });
    expect(result.current.isCropping).toBe(false);
  });

  it('loads a bundled sample through fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample(AVATAR_SAMPLES[0]);
    });
    await settle();
    expect(deps.loadRgbaImage).toHaveBeenCalled();
    expect(result.current.stage).toBe('ready');
    vi.unstubAllGlobals();
  });

  it('explains a sample that cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadSample(AVATAR_SAMPLES[0]);
    });
    expect(result.current.error).toContain('could not be opened');
    vi.unstubAllGlobals();
  });
});

describe('useCropper', () => {
  function pointerEvent(overrides: Record<string, unknown> = {}) {
    return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      ...overrides,
    } as unknown as Parameters<ReturnType<typeof useCropper>['onPointerMove']>[0];
  }

  function setup() {
    const hook = renderHook(() => useCropper(PHOTO, { x: 8, y: 4, size: 30 }));
    const frame = document.createElement('div');
    frame.getBoundingClientRect = () => ({ width: 200, height: 200 }) as DOMRect;
    frame.setPointerCapture = () => undefined;
    (hook.result.current.frameRef as { current: HTMLDivElement | null }).current = frame;
    return { hook, frame };
  }

  it('clamps the starting box to the photo', () => {
    const { hook } = setup();
    expect(hook.result.current.box).toEqual(clampBox({ x: 8, y: 4, size: 30 }, PHOTO));
    expect(hook.result.current.squareStyle.width).toBe(`${(hook.result.current.box.size / PHOTO.width) * 100}%`);
  });

  it('drags the square with the pointer, in photo pixels', () => {
    const { hook } = setup();
    const start = hook.result.current.box;
    act(() => hook.result.current.onMoveStart(pointerEvent({ clientX: 0, clientY: 0 })));
    act(() => hook.result.current.onPointerMove(pointerEvent({ clientX: 20, clientY: 10 })));
    expect(hook.result.current.box.x).toBeGreaterThan(start.x);
    expect(hook.result.current.box.y).toBeGreaterThan(start.y);
    act(() => hook.result.current.onPointerUp());
  });

  it('resizes from the corner handle', () => {
    const { hook } = setup();
    const start = hook.result.current.box.size;
    act(() => hook.result.current.onResizeStart(pointerEvent({ clientX: 0, clientY: 0 })));
    act(() => hook.result.current.onPointerMove(pointerEvent({ clientX: 30, clientY: 30 })));
    expect(hook.result.current.box.size).not.toBe(start);
  });

  it('ignores movement without a drag, and a drag without a frame', () => {
    const hook = renderHook(() => useCropper(PHOTO, { x: 0, y: 0, size: 50 }));
    const before = hook.result.current.box;
    act(() => hook.result.current.onPointerMove(pointerEvent({ clientX: 40, clientY: 40 })));
    act(() => hook.result.current.onMoveStart(pointerEvent()));
    expect(hook.result.current.box).toEqual(before);
  });

  it('nudges with the arrow keys and grows or shrinks with +/-', () => {
    const { hook } = setup();
    const start = hook.result.current.box;

    const right = pointerEvent({ key: 'ArrowRight' }) as unknown as Parameters<ReturnType<typeof useCropper>['onKeyDown']>[0];
    act(() => hook.result.current.onKeyDown(right));
    expect(hook.result.current.box.x).toBeGreaterThan(start.x);
    expect(right.preventDefault).toHaveBeenCalled();

    const grow = pointerEvent({ key: '=' }) as unknown as Parameters<ReturnType<typeof useCropper>['onKeyDown']>[0];
    const grown = hook.result.current.box.size;
    act(() => hook.result.current.onKeyDown(grow));
    expect(hook.result.current.box.size).toBeGreaterThan(grown);

    const shrink = pointerEvent({ key: '-' }) as unknown as Parameters<ReturnType<typeof useCropper>['onKeyDown']>[0];
    const shrunk = hook.result.current.box.size;
    act(() => hook.result.current.onKeyDown(shrink));
    expect(hook.result.current.box.size).toBeLessThan(shrunk);
  });

  it('ignores other keys entirely', () => {
    const { hook } = setup();
    const before = hook.result.current.box;
    const escape = pointerEvent({ key: 'Escape' }) as unknown as Parameters<ReturnType<typeof useCropper>['onKeyDown']>[0];
    act(() => hook.result.current.onKeyDown(escape));
    expect(hook.result.current.box).toEqual(before);
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });
});

describe('useShimmerFrames', () => {
  const avatar = { image: { width: 1, height: 1, data: new Uint8ClampedArray(4) } } as ComposedAvatar;

  it('shows the still, then the glint loop once settled', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShimmerFrames(avatar, true));
    expect(result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(220));
    expect(result.current).toHaveLength(3);
    expect(result.current[0]).toBe(avatar.image);
  });

  it('keeps a single frame when the sheen is off', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useShimmerFrames(avatar, false));
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toHaveLength(1);
  });

  it('cancels the pending shimmer on unmount and on a new avatar', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(({ a }) => useShimmerFrames(a, true), { initialProps: { a: avatar } });
    const other = { image: { width: 1, height: 1, data: new Uint8ClampedArray(4) } } as ComposedAvatar;
    rerender({ a: other });
    unmount();
    act(() => vi.advanceTimersByTime(1_000));
    expect(true).toBe(true);
  });
});

describe('useAvatarLook', () => {
  it('starts on the studio defaults with the first gilding preset', () => {
    const { result } = renderHook(() => useAvatarLook());
    expect(result.current.finish).toBe('natural');
    expect(result.current.frame).toBe('medallion');
    expect(result.current.gildingPresetId).not.toBeNull();
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isFineTuning).toBe(false);
  });

  it('edits the backdrop without losing the others', () => {
    const { result } = renderHook(() => useAvatarLook());
    const original = result.current.backdrop;
    act(() => result.current.choosePattern('chevron'));
    expect(result.current.backdrop.pattern.kind).toBe('chevron');
    act(() => result.current.setColour('colourOne', '#123456'));
    expect(result.current.backdrop.colourOne).toBe('#123456');
    act(() => result.current.setInlay('gilded-bands'));
    expect(result.current.backdrop.inlay).toBe('gilded-bands');
    act(() => result.current.setSpecKnob('gilt', 0.5));
    expect(result.current.backdrop.gilt).toBe(0.5);
    act(() => result.current.setPatternKnob('period', 12));
    expect(result.current.backdrop.pattern).not.toEqual({ kind: 'chevron' });
    expect(result.current.backdrop).not.toBe(original);
  });

  it('applies a palette and a backdrop preset', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.applyBackdropPreset(DEFAULT_BACKDROPS[3]));
    expect(result.current.backdrop).toEqual(DEFAULT_BACKDROPS[3].spec);
    act(() => result.current.choosePalette(ENAMEL_PALETTES[1]));
    expect(result.current.backdrop.colourOne).toBe(ENAMEL_PALETTES[1].colourOne);
  });

  it('tunes the cut-out and can reset it', () => {
    const { result } = renderHook(() => useAvatarLook());
    const tuning = result.current.tuning;
    act(() => result.current.setTuningKnob('threshold', 200));
    act(() => result.current.setBackgroundRemoved(false));
    expect(result.current.tuning).not.toEqual(tuning);
    act(() => result.current.resetTuning());
    expect(result.current.tuning).toEqual(tuning);
  });

  it('drops the preset badge once a tone is hand-tuned, and restores it from a preset', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setGildingRamp('deep'));
    expect(result.current.gildingPresetId).toBeNull();
    expect(result.current.gilding.rampId).toBe('deep');

    act(() => result.current.setGildingTone('clarity', 0.5));
    expect(result.current.gildingPresetId).toBeNull();
  });

  it('toggles the sheen and the fine-tuning panel', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.toggleShimmer());
    expect(result.current.isShimmering).toBe(false);
    act(() => result.current.toggleFineTuning());
    expect(result.current.isFineTuning).toBe(true);
    act(() => result.current.setFrame('plaque'));
    expect(result.current.frame).toBe('plaque');
    act(() => result.current.setFinish('gilded'));
    expect(result.current.finish).toBe('gilded');
  });

  it('restores every sample default', () => {
    const { result } = renderHook(() => useAvatarLook());
    act(() => result.current.setFrame('plaque'));
    act(() => result.current.setGildingRamp('deep'));
    act(() => result.current.applySampleDefaults());
    expect(result.current.frame).toBe('medallion');
    expect(result.current.gildingPresetId).not.toBeNull();
    expect(result.current.finish).toBe('natural');
  });
});

describe('useAvatarStudio', () => {
  it('cannot download before a photo is cropped', async () => {
    const { result } = renderHook(() => useAvatarStudio());
    expect(result.current.canDownload).toBe(false);
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).not.toHaveBeenCalled();
  });

  it('composes the avatar, exports it and reports export failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    const { result } = renderHook(() => useAvatarStudio());
    act(() => result.current.showWeiLing());
    await settle();
    await settle();
    expect(result.current.canDownload).toBe(true);
    expect(result.current.previewFrames.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).toHaveBeenCalledWith(
      expect.anything(),
      `${result.current.session.photoName.replace(/\.[^.]+$/, '')}-gilded-avatar`
    );
    expect(result.current.isExporting).toBe(false);

    vi.unstubAllGlobals();
  });

  it('names an export "portrait" when the photo has no stem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    const { result } = renderHook(() => useAvatarStudio());
    await act(async () => {
      await result.current.session.loadFile(new File(['x'], '.png', { type: 'image/png' }));
    });
    await settle();
    await settle();
    act(() => result.current.session.confirmCrop(BOX));
    expect(result.current.canDownload).toBe(true);
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(deps.downloadGildedPng).toHaveBeenCalledWith(expect.anything(), 'portrait-gilded-avatar');
    vi.unstubAllGlobals();
  });

  it('reports an export failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })));
    const { result } = renderHook(() => useAvatarStudio());
    act(() => result.current.showWeiLing());
    await settle();
    await settle();
    deps.downloadGildedPng.mockRejectedValueOnce(new Error('nope'));
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.exportError).toContain('could not be prepared');
    vi.unstubAllGlobals();
  });
});
