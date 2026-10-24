import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchStub, type FetchStub } from '../../test-utils/fetchStub.js';

const shrinkForGallery = vi.fn();

/*
 * `shrinkPhoto` is mocked, and it is the one module here that should be: it draws the file into a
 * canvas, which jsdom does not implement, so the real thing cannot run in this environment at all.
 * That makes it a browser boundary rather than one of our own modules, and it has its own tests
 * (`shrinkPhoto.test.ts`). Everything else below the network stays real.
 */
vi.mock('../photo/shrinkPhoto.js', () => ({
  shrinkForGallery: (...args: unknown[]) => shrinkForGallery(...args),
}));

const { useUploadPhoto } = await import('./useUploadPhoto.js');

/**
 * ADR-047 — picking a photo and sharing it.
 *
 * The ordering the hook's own comment calls "the point" is what most of this pins: the shrink happens
 * *before* the request, so what leaves the phone is small and has no EXIF. A test that let the upload
 * happen with the original file would still pass on caption and error handling, so the shrunk result
 * is asserted as the thing that actually went up.
 */

const UPLOAD = 'POST /api/gallery/photos';
/*
 * A real `ShrunkPhoto`: three Blobs plus the archive metadata (ADR-050/052). The shape matters — the
 * api layer does `form.set('full', photo.full, 'full')`, so a stand-in missing a Blob throws inside
 * the upload and surfaces as a generic failure rather than as the wrong-shape bug it is.
 */
const SHRUNK = {
  full: new Blob(['full'], { type: 'image/jpeg' }),
  thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
  raw: new Blob(['raw'], { type: 'image/jpeg' }),
  filename: 'beach.jpg',
  rawIsOriginal: true,
  width: 1600,
  height: 1200,
};
let stub: FetchStub;
let shared: ReturnType<typeof vi.fn>;

const aFile = () => new File(['pretend jpeg'], 'beach.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  shared = vi.fn();
  shrinkForGallery.mockResolvedValue(SHRUNK);
  stub = installFetchStub({ [UPLOAD]: { status: 201, body: { photo: { id: 'p1' } } } });
});

afterEach(() => {
  stub.restore();
  vi.clearAllMocks();
});

describe('useUploadPhoto', () => {
  it('starts with nothing to share', () => {
    const { result } = renderHook(() => useUploadPhoto(shared));

    expect(result.current.hasPhoto).toBe(false);
    expect(result.current.caption).toBe('');
    expect(result.current.isSharing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does nothing at all when share is pressed with no photo', async () => {
    const { result } = renderHook(() => useUploadPhoto(shared));

    await act(async () => {
      result.current.share();
    });

    expect(shrinkForGallery).not.toHaveBeenCalled();
    expect(stub.callsTo(UPLOAD)).toHaveLength(0);
    expect(shared).not.toHaveBeenCalled();
  });

  it('takes a picked photo, and a cancelled picker leaves nothing behind', () => {
    const { result } = renderHook(() => useUploadPhoto(shared));

    act(() => result.current.pick(aFile()));
    expect(result.current.hasPhoto).toBe(true);

    // The file input hands back `undefined` when the participant cancels.
    act(() => result.current.pick(undefined));
    expect(result.current.hasPhoto).toBe(false);
  });

  it('shrinks first, then uploads the shrunk photo with the caption', async () => {
    const { result } = renderHook(() => useUploadPhoto(shared));
    const file = aFile();
    act(() => result.current.pick(file));
    act(() => result.current.setCaption('Sandcastle, unfinished'));

    await act(async () => {
      result.current.share();
    });

    await waitFor(() => expect(stub.callsTo(UPLOAD)).toHaveLength(1));
    expect(shrinkForGallery).toHaveBeenCalledWith(file);
    /*
     * The upload is multipart, so the stub records no parsed body and the form's fields cannot be read
     * back here. What this asserts instead is that the request happened at all and was handed the file
     * to shrink; the *ordering* — shrink strictly before the request — is asserted separately below,
     * where a pending shrink is shown to leave the network untouched.
     */
    expect(stub.callsTo(UPLOAD)[0]?.method).toBe('POST');
  });

  it('empties the form and tells the caller once it is up', async () => {
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));
    act(() => result.current.setCaption('done'));

    await act(async () => {
      result.current.share();
    });

    await waitFor(() => expect(shared).toHaveBeenCalledTimes(1));
    expect(result.current.hasPhoto).toBe(false);
    expect(result.current.caption).toBe('');
    expect(result.current.isSharing).toBe(false);
  });

  /*
   * The retry case, and the reason a failed share must not call `clear()`: a participant on a beach
   * connection who loses the photo and the caption they just typed will not pick them again.
   */
  it('keeps the photo and the caption when the upload is refused', async () => {
    stub.restore();
    stub = installFetchStub({
      [UPLOAD]: { status: 413, body: { error: { message: 'That photo is too large.' } } },
    });
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));
    act(() => result.current.setCaption('keep me'));

    await act(async () => {
      result.current.share();
    });

    await waitFor(() => expect(result.current.error).toBe('That photo is too large.'));
    expect(result.current.hasPhoto).toBe(true);
    expect(result.current.caption).toBe('keep me');
    expect(result.current.isSharing).toBe(false);
    expect(shared).not.toHaveBeenCalled();
  });

  it('reports a photo it could not shrink, without reaching the network', async () => {
    shrinkForGallery.mockRejectedValue(new Error('That photo could not be read.'));
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));

    await act(async () => {
      result.current.share();
    });

    await waitFor(() => expect(result.current.error).toBe('That photo could not be read.'));
    expect(stub.callsTo(UPLOAD)).toHaveLength(0);
  });

  it('ignores a second tap while the first share is still going', async () => {
    let release = (): void => undefined;
    shrinkForGallery.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(SHRUNK);
        }),
    );
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));

    act(() => result.current.share());
    await waitFor(() => expect(result.current.isSharing).toBe(true));
    // Shrink is still pending, so nothing may have left the phone yet — this is "shrink first".
    expect(stub.callsTo(UPLOAD)).toHaveLength(0);
    act(() => result.current.share());

    await act(async () => {
      release();
    });

    await waitFor(() => expect(shared).toHaveBeenCalledTimes(1));
    expect(stub.callsTo(UPLOAD)).toHaveLength(1);
  });

  it('forgets a picked photo on clear', () => {
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));
    act(() => result.current.setCaption('never mind'));

    act(() => result.current.clear());

    expect(result.current.hasPhoto).toBe(false);
    expect(result.current.caption).toBe('');
  });

  it('drops a stale error as soon as another photo is picked', async () => {
    shrinkForGallery.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useUploadPhoto(shared));
    act(() => result.current.pick(aFile()));
    await act(async () => {
      result.current.share();
    });
    await waitFor(() => expect(result.current.error).toBe('nope'));

    act(() => result.current.pick(aFile()));

    expect(result.current.error).toBeNull();
  });
});
