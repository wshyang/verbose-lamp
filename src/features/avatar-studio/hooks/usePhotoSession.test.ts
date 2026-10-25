// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RgbaImage, SquareBox } from '@/shared/lib/raster';
import type { SubjectMatte } from '@/features/background-removal';
import { startingBox } from '../cropBox';
import { STAGE_HINTS } from '../stage';

// The face locator, the segmenter and the image decoder need a browser and downloaded models, so
// they are doubled at their module seams. What is under test is the session itself: the stage it
// reports, and that results which arrive after Cancel or a newer photo are dropped.
const seams = vi.hoisted(() => ({
  locateFace: vi.fn(),
  warmUpFaceLocator: vi.fn(),
  segmentSubject: vi.fn(),
  warmUpSegmenter: vi.fn(),
  loadRgbaImage: vi.fn(),
}));

vi.mock('@/features/face-detection', () => ({ locateFace: seams.locateFace, warmUpFaceLocator: seams.warmUpFaceLocator }));
vi.mock('@/features/background-removal', () => ({ segmentSubject: seams.segmentSubject, warmUpSegmenter: seams.warmUpSegmenter }));
vi.mock('@/features/gilded-portrait', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/gilded-portrait')>()),
  loadRgbaImage: seams.loadRgbaImage,
}));

import { usePhotoSession } from './usePhotoSession';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const photo = (name: number): RgbaImage => ({ width: 40 + name, height: 20, data: new Uint8ClampedArray((40 + name) * 20 * 4) });
const MATTE: SubjectMatte = { width: 4, height: 4, data: new Uint8ClampedArray(16) };
const FACE: SquareBox = { x: 4, y: 2, size: 12 };
const file = (name = 'me.png', type = 'image/png') => new File(['x'], name, { type });

/** A photo whose analysis the test settles by hand. */
function stubPhoto(image: RgbaImage) {
  const face = deferred<SquareBox | null>();
  const matte = deferred<SubjectMatte | null>();
  seams.loadRgbaImage.mockResolvedValueOnce(image);
  seams.locateFace.mockReturnValueOnce(face.promise);
  seams.segmentSubject.mockReturnValueOnce(matte.promise);
  return { face, matte };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  for (const seam of Object.values(seams)) seam.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('usePhotoSession', () => {
  it('starts idle and warms both models up once', () => {
    const { result } = renderHook(() => usePhotoSession());

    expect(result.current.stage).toBe('idle');
    expect(result.current.hint).toBe(STAGE_HINTS.idle);
    expect(result.current.photo).toBeNull();
    expect(result.current.cropperStart).toBeNull();
    expect(result.current.isCropping).toBe(false);
    expect(result.current.cutOut).toBe('available');
    expect(seams.warmUpFaceLocator).toHaveBeenCalledTimes(1);
    expect(seams.warmUpSegmenter).toHaveBeenCalledTimes(1);
  });

  it('ignores an empty file choice', async () => {
    const { result } = renderHook(() => usePhotoSession());

    await act(() => result.current.loadFile(null));

    expect(result.current.stage).toBe('idle');
    expect(seams.loadRgbaImage).not.toHaveBeenCalled();
  });

  it.each([
    ['text/plain', 'Choose an image file'],
    ['image/heic', 'HEIC photos are not supported'],
  ])('refuses a %s file without decoding it', async (type, reason) => {
    const { result } = renderHook(() => usePhotoSession());

    await act(() => result.current.loadFile(file('x', type)));

    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toContain(reason);
    expect(result.current.photo).toBeNull();
    expect(seams.loadRgbaImage).not.toHaveBeenCalled();
  });

  it('works through working, refining and ready as the face and then the matte arrive', async () => {
    const image = photo(0);
    const { face, matte } = stubPhoto(image);
    const { result } = renderHook(() => usePhotoSession());

    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadFile(file('portrait.png'));
    });
    expect(result.current.stage).toBe('working');
    expect(result.current.photoName).toBe('portrait.png');
    expect(result.current.isLocating && result.current.isSegmenting).toBe(true);

    await act(() => loading);
    expect(result.current.photo).toBe(image);
    expect(seams.locateFace).toHaveBeenCalledWith(image);
    expect(seams.segmentSubject).toHaveBeenCalledWith(image);
    expect(result.current.stage).toBe('working');

    await act(async () => face.resolve(FACE));
    expect(result.current.crop).toEqual(FACE);
    expect(result.current.foundCrop).toEqual(FACE);
    expect(result.current.stage).toBe('refining');
    expect(result.current.cutOut).toBe('pending');
    expect(result.current.cropperStart).toEqual(FACE);

    await act(async () => matte.resolve(MATTE));
    expect(result.current.stage).toBe('ready');
    expect(result.current.matte).toBe(MATTE);
    expect(result.current.cutOut).toBe('available');
    expect(result.current.hint).toBe(STAGE_HINTS.ready);
  });

  it('asks for a manual crop when no face is found, opening the square at the default box', async () => {
    const image = photo(0);
    const { face, matte } = stubPhoto(image);
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file()));

    await act(async () => face.resolve(null));
    await act(async () => matte.resolve(MATTE));

    expect(result.current.stage).toBe('cropping');
    expect(result.current.isCropping).toBe(true);
    expect(result.current.cropperStart).toEqual(startingBox(image));
  });

  it('carries on with the full photo when the background cannot be removed', async () => {
    const { face, matte } = stubPhoto(photo(0));
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file()));

    await act(async () => face.resolve(FACE));
    await act(async () => matte.resolve(null));

    expect(result.current.stage).toBe('plain');
    expect(result.current.cutOut).toBe('unavailable');
  });

  it('does not wait for the segmenter to take the face', async () => {
    const { face, matte } = stubPhoto(photo(0));
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file()));

    await act(async () => matte.resolve(MATTE));
    expect(result.current.stage).toBe('working');
    await act(async () => face.resolve(FACE));

    expect(result.current.stage).toBe('ready');
  });

  it.each([
    [new Error('The file is corrupt.'), 'The file is corrupt.'],
    ['nope', 'That image could not be opened.'],
  ])('fails with a readable message when decoding throws %o', async (thrown, message) => {
    seams.loadRgbaImage.mockRejectedValueOnce(thrown);
    const { result } = renderHook(() => usePhotoSession());

    await act(() => result.current.loadFile(file()));

    expect(result.current.stage).toBe('failed');
    expect(result.current.error).toBe(message);
    expect(result.current.photo).toBeNull();
    expect(seams.locateFace).not.toHaveBeenCalled();
  });

  it('drops a face that arrives after Cancel', async () => {
    const { face } = stubPhoto(photo(0));
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file()));

    act(() => result.current.cancel());
    await act(async () => face.resolve(FACE));

    expect(result.current.stage).toBe('idle');
    expect(result.current.crop).toBeNull();
    expect(result.current.photo).toBeNull();
  });

  it('drops a matte that arrives after Cancel', async () => {
    const { matte } = stubPhoto(photo(0));
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file()));

    act(() => result.current.cancel());
    await act(async () => matte.resolve(MATTE));

    expect(result.current.matte).toBeNull();
  });

  it('drops a photo that finishes decoding after a newer photo was chosen', async () => {
    const slow = deferred<RgbaImage>();
    seams.loadRgbaImage.mockReturnValueOnce(slow.promise);
    const newer = photo(5);
    stubPhoto(newer);
    const { result } = renderHook(() => usePhotoSession());

    let first!: Promise<void>;
    act(() => {
      first = result.current.loadFile(file('old.png'));
    });
    await act(() => result.current.loadFile(file('new.png')));
    await act(async () => {
      slow.resolve(photo(0));
      await first;
    });

    expect(result.current.photo).toBe(newer);
    expect(result.current.photoName).toBe('new.png');
    expect(seams.locateFace).toHaveBeenCalledTimes(1);
  });

  it('drops the analysis of the first photo once a second photo replaces it', async () => {
    const firstRun = stubPhoto(photo(0));
    const secondRun = stubPhoto(photo(5));
    const { result } = renderHook(() => usePhotoSession());
    await act(() => result.current.loadFile(file('one.png')));
    await act(() => result.current.loadFile(file('two.png')));

    await act(async () => firstRun.face.resolve({ x: 0, y: 0, size: 9 }));
    expect(result.current.crop).toBeNull();
    await act(async () => secondRun.face.resolve(FACE));

    expect(result.current.crop).toEqual(FACE);
  });

  it('drops a decode failure that belongs to an abandoned photo', async () => {
    const slow = deferred<RgbaImage>();
    seams.loadRgbaImage.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => usePhotoSession());
    let first!: Promise<void>;
    act(() => {
      first = result.current.loadFile(file());
    });

    act(() => result.current.cancel());
    await act(async () => {
      slow.reject(new Error('late failure'));
      await first;
    });

    expect(result.current.stage).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('starts nothing for a photo that finishes decoding after unmount', async () => {
    const slow = deferred<RgbaImage>();
    seams.loadRgbaImage.mockReturnValueOnce(slow.promise);
    const { result, unmount } = renderHook(() => usePhotoSession());
    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadFile(file());
    });

    unmount();
    slow.resolve(photo(0));
    await loading;

    expect(seams.locateFace).not.toHaveBeenCalled();
    expect(seams.segmentSubject).not.toHaveBeenCalled();
  });

  describe('adjusting the crop', () => {
    async function readySession() {
      const run = stubPhoto(photo(0));
      const view = renderHook(() => usePhotoSession());
      await act(() => view.result.current.loadFile(file()));
      await act(async () => run.face.resolve(FACE));
      await act(async () => run.matte.resolve(MATTE));
      return view;
    }

    it('opens the cropper on request and closes it when a box is confirmed', async () => {
      const { result } = await readySession();
      expect(result.current.isCropping).toBe(false);

      act(() => result.current.startAdjusting());
      expect(result.current.isCropping).toBe(true);
      expect(result.current.stage).toBe('ready');

      const box: SquareBox = { x: 8, y: 1, size: 10 };
      act(() => result.current.confirmCrop(box));
      expect(result.current.isCropping).toBe(false);
      expect(result.current.crop).toEqual(box);
      expect(result.current.foundCrop).toEqual(FACE);
      expect(result.current.cropperStart).toEqual(box);
    });

    it('backs out of adjusting without losing the photo, and cancels the session on the next back-out', async () => {
      const { result } = await readySession();
      act(() => result.current.startAdjusting());

      act(() => result.current.cancelCrop());
      expect(result.current.isCropping).toBe(false);
      expect(result.current.photo).not.toBeNull();

      act(() => result.current.cancelCrop());
      expect(result.current.photo).toBeNull();
      expect(result.current.stage).toBe('idle');
    });

    it('does not open the cropper while the face is still being looked for', async () => {
      stubPhoto(photo(0));
      const { result } = renderHook(() => usePhotoSession());
      await act(() => result.current.loadFile(file()));

      act(() => result.current.startAdjusting());

      expect(result.current.isCropping).toBe(false);
    });

    it('stops adjusting when a different photo is chosen', async () => {
      const { result } = await readySession();
      act(() => result.current.startAdjusting());
      stubPhoto(photo(5));

      await act(() => result.current.loadFile(file('other.png')));
      await flush();

      expect(result.current.isCropping).toBe(false);
    });

    it('clears the whole session on cancel, whatever stage it was in', async () => {
      const { result } = await readySession();

      act(() => result.current.cancel());

      expect(result.current).toMatchObject({
        stage: 'idle', photo: null, photoName: '', crop: null, foundCrop: null, matte: null, error: null,
        isLocating: false, isSegmenting: false, isCropping: false,
      });
    });
  });

  describe('loadSample', () => {
    const sample = { id: 'wl', name: 'Wei_Ling', persona: 'x', src: '/samples/wl.jpg' };

    it('fetches the sample and opens it as a jpeg named after the person', async () => {
      const blob = new Blob(['jpg'], { type: '' });
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(blob) })));
      stubPhoto(photo(0));
      const { result } = renderHook(() => usePhotoSession());

      await act(() => result.current.loadSample(sample));

      expect(fetch).toHaveBeenCalledWith('/samples/wl.jpg');
      expect(result.current.photoName).toBe('Wei_Ling.jpg');
      expect(result.current.photo).not.toBeNull();
    });

    it('keeps the blob type when it has one', async () => {
      const blob = new Blob(['png'], { type: 'image/png' });
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(blob) })));
      stubPhoto(photo(0));
      const { result } = renderHook(() => usePhotoSession());

      await act(() => result.current.loadSample(sample));

      expect(result.current.stage).toBe('working');
    });

    it('names the person when their photo cannot be fetched', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      const { result } = renderHook(() => usePhotoSession());

      await act(() => result.current.loadSample(sample));

      expect(result.current.stage).toBe('failed');
      expect(result.current.error).toBe("Wei_Ling's photo could not be opened.");
    });
  });
});
