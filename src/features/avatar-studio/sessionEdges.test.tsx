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

describe('usePhotoSession guards', () => {
  it('reports a non-Error rejection in plain words', async () => {
    deps.loadRgbaImage.mockRejectedValueOnce('nope');
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => {
      await result.current.loadFile(new File(['x'], 'photo.png', { type: 'image/png' }));
    });
    expect(result.current.error).toBe('That image could not be opened.');
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
});
