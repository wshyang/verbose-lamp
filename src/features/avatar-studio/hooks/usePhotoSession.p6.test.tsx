// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { act, renderHook, waitFor } from '@testing-library/react';

import { type SquareBox } from '@/shared/lib/raster';

import { usePhotoSession } from './usePhotoSession';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

import { STAGE_HINTS } from '../stage';

setupDomTests();
/**
 * The face locator and the segmenter download and run models, so they are the two
 * seams that get doubled; the photo decoding, the stage machine and the session
 * bookkeeping all run for real.
 */
const models = vi.hoisted(() => ({
  locateFace: vi.fn(),
  segmentSubject: vi.fn(),
  warmUpFaceLocator: vi.fn(),
  warmUpSegmenter: vi.fn(),
}));
vi.mock('@/features/face-detection', () => ({
  locateFace: models.locateFace,
  warmUpFaceLocator: models.warmUpFaceLocator,
}));
vi.mock('@/features/background-removal', () => ({
  segmentSubject: models.segmentSubject,
  warmUpSegmenter: models.warmUpSegmenter,
}));
const SIZE = { width: 200, height: 160 };
const face: SquareBox = { x: 40, y: 20, size: 120 };
const matte_p6 = { width: 200, height: 160, data: new Uint8ClampedArray(200 * 160) };
const file_p6 = (name = 'me.png', type = 'image/png', size = 2048) => {
  const blob = new File(['x'], name, { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
};
const mount = () => renderHook(() => usePhotoSession());
beforeEach(() => {
  installCanvas2d();
  models.locateFace.mockReset().mockResolvedValue(face);
  models.segmentSubject.mockReset().mockResolvedValue(matte_p6);
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: SIZE.width, height: SIZE.height, close: vi.fn() })));
});
describe('initial session', () => {
  it('starts idle with background removal offered', () => {
    const { result } = mount();

    expect(result.current.stage).toBe('idle');
    expect(result.current.hint).toBe(STAGE_HINTS.idle);
    expect(result.current.photo).toBeNull();
    expect(result.current.photoName).toBe('');
    expect(result.current.cropperStart).toBeNull();
    expect(result.current.isCropping).toBe(false);
    expect(result.current.cutOut).toBe('available');
    expect(result.current.error).toBeNull();
  });
});
describe('loading a photo', () => {
  it('rejects an unsupported file with a plain-language reason', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file_p6('notes.txt', 'text/plain'));
    });

    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toMatch(/Choose an image file/);
  });

  it('reports a decode failure', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file_p6('broken.png'));
    });

    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toBe(
      'That image could not be opened. Try a different PNG, JPEG, or WebP file.'
    );
    expect(result.current.photoName).toBe('');
  });

  it('reports a zero-sized bitmap through the loader message', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 0, height: 0, close: vi.fn() })));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file_p6('empty.png'));
    });

    expect(result.current.error).toBe(
      'That image could not be opened. Try a different PNG, JPEG, or WebP file.'
    );
  });

  it('walks idle → working → refining → ready while the models run', async () => {
    let resolveFace: (box: SquareBox) => void = () => {};
    let resolveMatte: (value: typeof matte_p6) => void = () => {};
    models.locateFace.mockImplementation(() => new Promise((resolve) => { resolveFace = resolve; }));
    models.segmentSubject.mockImplementation(() => new Promise((resolve) => { resolveMatte = resolve; }));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file_p6('me.png'));
    });

    expect(result.current.photo).not.toBeNull();
    expect(result.current.stage).toBe('working');
    expect(result.current.hint).toBe(STAGE_HINTS.working);
    expect(result.current.photoName).toBe('me.png');
    expect(result.current.cutOut).toBe('pending');

    await act(async () => {
      resolveFace(face);
      await Promise.resolve();
    });

    expect(result.current.stage).toBe('refining');
    expect(result.current.crop).toEqual(face);
    expect(result.current.foundCrop).toEqual(face);
    expect(result.current.isLocating).toBe(false);
    // Face found, background still lifting: the square opens on the face.
    expect(result.current.cropperStart).toEqual(face);

    await act(async () => {
      resolveMatte(matte_p6);
      await Promise.resolve();
    });

    expect(result.current.stage).toBe('ready');
    expect(result.current.hint).toBe(STAGE_HINTS.ready);
    expect(result.current.matte).toBe(matte_p6);
    expect(result.current.cutOut).toBe('available');
  });

  it('offers manual cropping when no face was found', async () => {
    models.locateFace.mockResolvedValue(null);
    models.segmentSubject.mockResolvedValue(null);
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file_p6('group.png'));
    });
    await waitFor(() => expect(result.current.isLocating).toBe(false));

    expect(result.current.crop).toBeNull();
    expect(result.current.stage).toBe('cropping');
    expect(result.current.isCropping).toBe(true);
    // No face and no crop: the square opens centred at 80 % of the short edge.
    // Centred, 80 % of the 160 px short edge, clamped inside the frame.
    expect(result.current.cropperStart).toEqual({ x: 36, y: 16, size: 128 });
    expect(result.current.cutOut).toBe('unavailable');
  });
});
describe('the manual square', () => {
  it('confirms a crop and drops back to the ready stage', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.loadFile(file_p6('me.png'));
    });

    act(() => result.current.confirmCrop({ x: 10, y: 10, size: 90 }));

    expect(result.current.crop).toEqual({ x: 10, y: 10, size: 90 });
    expect(result.current.isCropping).toBe(false);
    expect(result.current.cropperStart).toEqual({ x: 10, y: 10, size: 90 });
  });
});
