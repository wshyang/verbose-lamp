// @vitest-environment jsdom
// From PR #2 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoSession } from './usePhotoSession';

interface Deferred_p2<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}
function deferred_p2<T>(): Deferred_p2<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const PHOTO = { width: 100, height: 80, data: new Uint8ClampedArray(4) };
const BOX = { x: 10, y: 10, size: 40 };
const MATTE_p2 = { width: 10, height: 8, alpha: new Uint8ClampedArray(80) };
const mocks = vi.hoisted(() => ({
  segmentSubject: vi.fn(),
  warmUpSegmenter: vi.fn(),
  locateFace: vi.fn(),
  warmUpFaceLocator: vi.fn(),
  validateImageFile: vi.fn(),
  loadRgbaImage: vi.fn(),
}));
vi.mock('@/features/background-removal', () => ({
  segmentSubject: mocks.segmentSubject,
  warmUpSegmenter: mocks.warmUpSegmenter,
}));
vi.mock('@/features/face-detection', () => ({
  locateFace: mocks.locateFace,
  warmUpFaceLocator: mocks.warmUpFaceLocator,
}));
vi.mock('@/features/gilded-portrait', () => ({
  validateImageFile: mocks.validateImageFile,
  loadRgbaImage: mocks.loadRgbaImage,
}));
function file_p2(name = 'portrait.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateImageFile.mockReturnValue({ ok: true });
  mocks.loadRgbaImage.mockResolvedValue(PHOTO);
  mocks.locateFace.mockResolvedValue(BOX);
  mocks.segmentSubject.mockResolvedValue(MATTE_p2);
});
afterEach(() => vi.unstubAllGlobals());
describe('usePhotoSession', () => {
  it('starts idle, warms both engines, and ignores a null file', async () => {
    const { result, unmount } = renderHook(() => usePhotoSession());
    expect(result.current).toMatchObject({
      stage: 'idle', cutOut: 'available', cropperStart: null, isCropping: false,
    });
    expect(mocks.warmUpFaceLocator).toHaveBeenCalledOnce();
    expect(mocks.warmUpSegmenter).toHaveBeenCalledOnce();
    await act(async () => result.current.loadFile(null));
    expect(mocks.loadRgbaImage).not.toHaveBeenCalled();
    unmount();
  });

  it('rejects invalid files before decoding', async () => {
    mocks.validateImageFile.mockReturnValue({ ok: false, reason: 'Wrong format' });
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => result.current.loadFile(file_p2()));
    expect(result.current).toMatchObject({ stage: 'failed', error: 'Wrong format', photo: null });
    expect(mocks.loadRgbaImage).not.toHaveBeenCalled();
  });

  it('loads a photo and independently resolves face and matte', async () => {
    const decoded = deferred_p2<typeof PHOTO>();
    const located = deferred_p2<typeof BOX | null>();
    const segmented = deferred_p2<typeof MATTE_p2 | null>();
    mocks.loadRgbaImage.mockReturnValue(decoded.promise);
    mocks.locateFace.mockReturnValue(located.promise);
    mocks.segmentSubject.mockReturnValue(segmented.promise);
    const { result } = renderHook(() => usePhotoSession());
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadFile(file_p2('sitter.png')); });
    expect(result.current).toMatchObject({
      photoName: 'sitter.png', isLocating: true, isSegmenting: true, stage: 'working',
    });
    await act(async () => {
      decoded.resolve(PHOTO);
      await loading;
    });
    expect(result.current.cropperStart).toEqual({ x: 18, y: 8, size: 64 });
    await act(async () => located.resolve(BOX));
    expect(result.current).toMatchObject({ crop: BOX, foundCrop: BOX, stage: 'refining', cutOut: 'pending' });
    await act(async () => segmented.resolve(MATTE_p2));
    expect(result.current).toMatchObject({ matte: MATTE_p2, stage: 'ready', cutOut: 'available' });

    act(() => result.current.startAdjusting());
    expect(result.current.isCropping).toBe(true);
    act(() => result.current.cancelCrop());
    expect(result.current.isCropping).toBe(false);
    const changed = { x: 2, y: 3, size: 30 };
    act(() => result.current.startAdjusting());
    act(() => result.current.confirmCrop(changed));
    expect(result.current.crop).toBe(changed);
    act(() => result.current.cancelCrop());
    expect(result.current.photo).toBeNull();
  });

  it('falls back to manual cropping and plain display when analysis finds nothing', async () => {
    mocks.locateFace.mockResolvedValue(null);
    mocks.segmentSubject.mockResolvedValue(null);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => result.current.loadFile(file_p2()));
    expect(result.current).toMatchObject({
      stage: 'cropping', crop: null, matte: null, isCropping: true, cutOut: 'unavailable',
    });
    // Once the user places a crop while segmentation has finished empty, it is plain.
    act(() => result.current.confirmCrop(BOX));
    expect(result.current).toMatchObject({ stage: 'plain', cutOut: 'unavailable' });
  });

  it('reports an unavailable cut-out once locating finishes without a matte', async () => {
    const segmented = deferred_p2<null>();
    mocks.segmentSubject.mockReturnValue(segmented.promise);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => result.current.loadFile(file_p2()));
    expect(result.current.cutOut).toBe('pending');
    await act(async () => segmented.resolve(null));
    expect(result.current).toMatchObject({ stage: 'plain', cutOut: 'unavailable' });
  });

  it('drops stale decode and analysis results after cancel', async () => {
    const decoded = deferred_p2<typeof PHOTO>();
    mocks.loadRgbaImage.mockReturnValue(decoded.promise);
    const { result } = renderHook(() => usePhotoSession());
    let first!: Promise<void>;
    act(() => { first = result.current.loadFile(file_p2('one.jpg')); });
    act(() => result.current.cancel());
    await act(async () => {
      decoded.resolve(PHOTO);
      await first;
    });
    expect(result.current.photo).toBeNull();
    expect(mocks.locateFace).not.toHaveBeenCalled();

    const located = deferred_p2<typeof BOX>();
    const segmented = deferred_p2<typeof MATTE_p2>();
    mocks.loadRgbaImage.mockResolvedValue(PHOTO);
    mocks.locateFace.mockReturnValue(located.promise);
    mocks.segmentSubject.mockReturnValue(segmented.promise);
    await act(async () => result.current.loadFile(file_p2('two.jpg')));
    act(() => result.current.cancel());
    await act(async () => {
      located.resolve(BOX);
      segmented.resolve(MATTE_p2);
    });
    expect(result.current.photo).toBeNull();
  });

  it('reports Error and non-Error decode failures only for the current session', async () => {
    const { result } = renderHook(() => usePhotoSession());
    mocks.loadRgbaImage.mockRejectedValueOnce(new Error('Decode broke'));
    await act(async () => result.current.loadFile(file_p2()));
    expect(result.current.error).toBe('Decode broke');
    mocks.loadRgbaImage.mockRejectedValueOnce('nope');
    await act(async () => result.current.loadFile(file_p2()));
    expect(result.current.error).toBe('That image could not be opened.');

    const decoded = deferred_p2<typeof PHOTO>();
    mocks.loadRgbaImage.mockReturnValue(decoded.promise);
    let loading!: Promise<void>;
    act(() => { loading = result.current.loadFile(file_p2()); });
    act(() => result.current.cancel());
    await act(async () => {
      decoded.reject(new Error('late'));
      await loading;
    });
    expect(result.current.error).toBeNull();
  });

  it('loads samples through fetch, with MIME fallbacks and fetch-failure copy', async () => {
    const fetchMock = vi.fn(async () => ({ blob: async () => new Blob(['jpeg']) }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePhotoSession());
    await act(async () => result.current.loadSample({ name: 'Wei_Ling', src: 'sample.jpg' } as never));
    expect(fetchMock).toHaveBeenCalledWith('sample.jpg');
    expect(mocks.loadRgbaImage.mock.calls[0][0]).toMatchObject({ name: 'Wei_Ling.jpg', type: 'image/jpeg' });

    fetchMock.mockResolvedValueOnce({ blob: async () => new Blob(['png'], { type: 'image/png' }) } as never);
    await act(async () => result.current.loadSample({ name: 'Daisy', src: 'daisy.png' } as never));
    expect(mocks.loadRgbaImage.mock.calls[1][0].type).toBe('image/png');

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await act(async () => result.current.loadSample({ name: 'Nick', src: 'nick.jpg' } as never));
    expect(result.current.error).toBe("Nick's photo could not be opened.");
  });
});
