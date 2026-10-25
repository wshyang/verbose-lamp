// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { setupDomTests } from '@/test/dom';
import { installCanvas2d } from '@/test/canvas2d';

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

import { usePhotoSession } from './usePhotoSession';
import { STAGE_HINTS } from '../stage';
import type { SquareBox } from '@/shared/lib/raster';

const SIZE = { width: 200, height: 160 };
const face: SquareBox = { x: 40, y: 20, size: 120 };
const matte = { width: 200, height: 160, data: new Uint8ClampedArray(200 * 160) };

const file = (name = 'me.png', type = 'image/png', size = 2048) => {
  const blob = new File(['x'], name, { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
};

const mount = () => renderHook(() => usePhotoSession());

beforeEach(() => {
  installCanvas2d();
  models.locateFace.mockReset().mockResolvedValue(face);
  models.segmentSubject.mockReset().mockResolvedValue(matte);
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

  it('warms the models up on mount and invalidates the session on unmount', () => {
    mount();

    expect(models.warmUpFaceLocator).toHaveBeenCalledTimes(1);
    expect(models.warmUpSegmenter).toHaveBeenCalledTimes(1);
  });
});

describe('loading a photo', () => {
  it('ignores an empty selection', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(null);
    });

    expect(result.current.stage).toBe('idle');
  });

  it('rejects an unsupported file with a plain-language reason', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('notes.txt', 'text/plain'));
    });

    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toMatch(/Choose an image file/);
  });

  it('reports a decode failure', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('broken.png'));
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
      await result.current.loadFile(file('empty.png'));
    });

    expect(result.current.error).toBe(
      'That image could not be opened. Try a different PNG, JPEG, or WebP file.'
    );
  });

  it('walks idle → working → refining → ready while the models run', async () => {
    let resolveFace: (box: SquareBox) => void = () => {};
    let resolveMatte: (value: typeof matte) => void = () => {};
    models.locateFace.mockImplementation(() => new Promise((resolve) => { resolveFace = resolve; }));
    models.segmentSubject.mockImplementation(() => new Promise((resolve) => { resolveMatte = resolve; }));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('me.png'));
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
      resolveMatte(matte);
      await Promise.resolve();
    });

    expect(result.current.stage).toBe('ready');
    expect(result.current.hint).toBe(STAGE_HINTS.ready);
    expect(result.current.matte).toBe(matte);
    expect(result.current.cutOut).toBe('available');
  });

  it('offers manual cropping when no face was found', async () => {
    models.locateFace.mockResolvedValue(null);
    models.segmentSubject.mockResolvedValue(null);
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('group.png'));
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

  it('drops a load that was cancelled mid-flight', async () => {
    let resolveFace: (box: SquareBox) => void = () => {};
    models.locateFace.mockImplementation(() => new Promise((resolve) => { resolveFace = resolve; }));
    const { result } = mount();

    await act(async () => {
      await result.current.loadFile(file('me.png'));
    });
    expect(result.current.photo).not.toBeNull();

    act(() => result.current.cancel());
    await act(async () => {
      resolveFace(face);
      await Promise.resolve();
    });

    expect(result.current.stage).toBe('idle');
    expect(result.current.crop).toBeNull();
  });

  it('ignores a photo that arrives after cancel', async () => {
    let resolveBitmap: (value: ImageBitmap) => void = () => {};
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(
        () =>
          new Promise<ImageBitmap>((resolve) => {
            resolveBitmap = resolve as (value: ImageBitmap) => void;
          })
      )
    );
    const { result } = mount();

    let pending: Promise<void>;
    await act(async () => {
      pending = result.current.loadFile(file('slow.png'));
    });
    act(() => result.current.cancel());

    await act(async () => {
      resolveBitmap({ width: 4, height: 4, close: vi.fn() } as unknown as ImageBitmap);
      await pending!;
    });

    expect(result.current.photo).toBeNull();
    expect(result.current.stage).toBe('idle');
  });
});

describe('the manual square', () => {
  it('confirms a crop and drops back to the ready stage', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.loadFile(file('me.png'));
    });

    act(() => result.current.confirmCrop({ x: 10, y: 10, size: 90 }));

    expect(result.current.crop).toEqual({ x: 10, y: 10, size: 90 });
    expect(result.current.isCropping).toBe(false);
    expect(result.current.cropperStart).toEqual({ x: 10, y: 10, size: 90 });
  });

  it('re-opens the square without losing the crop', async () => {
    const { result } = mount();
    await act(async () => {
      await result.current.loadFile(file('me.png'));
    });

    act(() => result.current.startAdjusting());
    expect(result.current.isCropping).toBe(true);

    act(() => result.current.cancelCrop());
    expect(result.current.isCropping).toBe(false);
    expect(result.current.photo).not.toBeNull();
  });

  it('cancels the whole session from the cropper when nothing is being adjusted', () => {
    const { result } = mount();

    act(() => result.current.cancelCrop());

    expect(result.current.stage).toBe('idle');
  });
});

describe('the bundled sample', () => {
  it('fetches the sample photo and loads it as a JPEG', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => blob })));
    const { result } = mount();

    await act(async () => {
      await result.current.loadSample({ id: 'wei-ling', name: 'Wei_Ling', persona: 'p', src: 'data:x' });
    });
    await waitFor(() => expect(result.current.photo).not.toBeNull());

    expect(result.current.photoName).toBe('Wei_Ling.jpg');
  });

  it('explains when the sample cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    const { result } = mount();

    await act(async () => {
      await result.current.loadSample({ id: 'wei-ling', name: 'Wei_Ling', persona: 'p', src: 'data:x' });
    });

    expect(result.current.error).toBe("Wei_Ling's photo could not be opened.");
    expect(result.current.stage).toBe('failed');
  });
});
