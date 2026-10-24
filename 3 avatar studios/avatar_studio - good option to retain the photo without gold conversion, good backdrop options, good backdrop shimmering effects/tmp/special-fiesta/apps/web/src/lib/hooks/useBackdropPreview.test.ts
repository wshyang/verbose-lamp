import { act, renderHook, waitFor } from '@testing-library/react';
import { formatAvatarLook, readAvatarLook } from '@psd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TUNING, type CutOutTuning } from '../avatar/cutOut.js';
import type { Bitmap } from '../avatar/types.js';
import { useBackdropPreview } from './useBackdropPreview.js';

/**
 * ADR-224 — the cropper's picture, as an image URL, and the bookkeeping around it.
 *
 * jsdom has no canvas, no `toBlob` and no object URLs, so each is stood in for here, and the tests
 * assert on what the hook asks of them: when it encodes, which URL is shown, and that every URL it
 * stops showing is revoked. The pixels themselves are pinned in `backdropPreview.test.ts`.
 */

const BASE_LOOK = '3-1-2-1-3-1f4e9c-1d5b8c';
const GOLD_LOOK = formatAvatarLook({ ...readAvatarLook(BASE_LOOK), backdrop: '#ffd700' });
const PHOTO: Bitmap = {
  width: 8,
  height: 8,
  pixels: new Uint8ClampedArray(8 * 8 * 4).map((_unused, index) => (index % 4 === 3 ? 255 : 120)),
};

type BlobCallback = (blob: Blob | null) => void;

let encodes = 0;
let queued: BlobCallback[] = [];
let holdEncodes = false;

function installCanvas(options: { context: unknown }): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    options.context as CanvasRenderingContext2D,
  );
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value(this: HTMLCanvasElement, callback: BlobCallback) {
      if (holdEncodes) {
        queued.push(callback);
        return;
      }
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  });
}

beforeEach(() => {
  encodes = 0;
  queued = [];
  holdEncodes = false;
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    },
  );
  installCanvas({ context: { putImageData: vi.fn() } });
  Object.assign(URL, {
    createObjectURL: vi.fn(() => {
      encodes += 1;
      return `blob:preview-${encodes}`;
    }),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLCanvasElement.prototype as unknown as { toBlob?: unknown }).toBlob;
});

function hookFor(look: string, tuning: CutOutTuning = DEFAULT_TUNING, bitmap: Bitmap | null = PHOTO) {
  return renderHook(
    (props: { avatarLook: string }) =>
      useBackdropPreview({ bitmap, subject: null, tuning, avatarLook: props.avatarLook }),
    { initialProps: { avatarLook: look } },
  );
}

describe('useBackdropPreview (ADR-224)', () => {
  it('has nothing to show before a photograph has been chosen', async () => {
    const { result } = hookFor(BASE_LOOK, DEFAULT_TUNING, null);
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows the encoded picture once it is ready', async () => {
    const { result } = hookFor(BASE_LOOK);
    await waitFor(() => expect(result.current).toBe('blob:preview-1'));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shows nothing, and encodes nothing, while the cut-out is off', async () => {
    const { result } = hookFor(BASE_LOOK, { ...DEFAULT_TUNING, removeBackground: false });
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('replaces the picture when the backdrop changes, and revokes the one it replaces', async () => {
    const { result, rerender } = hookFor(BASE_LOOK);
    await waitFor(() => expect(result.current).toBe('blob:preview-1'));

    rerender({ avatarLook: GOLD_LOOK });
    await waitFor(() => expect(result.current).toBe('blob:preview-2'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('revokes the picture it is showing when the cropper goes away', async () => {
    const { result, unmount } = hookFor(BASE_LOOK);
    await waitFor(() => expect(result.current).toBe('blob:preview-1'));

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('shows nothing when the browser cannot give a canvas context', async () => {
    installCanvas({ context: null });
    const { result } = hookFor(BASE_LOOK);
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('shows nothing, rather than breaking the studio, when the encoding throws', async () => {
    installCanvas({ context: { putImageData: vi.fn(() => { throw new Error('boom'); }) } });
    const { result } = hookFor(BASE_LOOK);
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('drops an encoding that finishes after a newer one has already been shown', async () => {
    holdEncodes = true;
    const { result, rerender } = hookFor(BASE_LOOK);
    rerender({ avatarLook: GOLD_LOOK });
    expect(queued).toHaveLength(2);

    // The newer encoding lands first and is shown; the stale one lands afterwards and must go.
    await act(async () => {
      queued[1]?.(new Blob(['newer'], { type: 'image/png' }));
    });
    await act(async () => {
      queued[0]?.(new Blob(['stale'], { type: 'image/png' }));
    });
    expect(result.current).toBe('blob:preview-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-2');
  });

  it('shows nothing when the browser cannot encode a picture at all', async () => {
    delete (HTMLCanvasElement.prototype as unknown as { toBlob?: unknown }).toBlob;
    const { result } = hookFor(BASE_LOOK);
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows nothing when the encoding produces no file', async () => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value(callback: BlobCallback) {
        callback(null);
      },
    });
    const { result } = hookFor(BASE_LOOK);
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('lets a newer picture stand when an older encoding comes back empty', async () => {
    holdEncodes = true;
    const { result, rerender } = hookFor(BASE_LOOK);
    rerender({ avatarLook: GOLD_LOOK });

    await act(async () => {
      queued[1]?.(new Blob(['newer'], { type: 'image/png' }));
    });
    await act(async () => {
      queued[0]?.(null);
    });
    expect(result.current).toBe('blob:preview-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:preview-1');
  });

  it('has nothing to revoke when the cropper goes away before any picture was made', async () => {
    const { unmount } = hookFor(BASE_LOOK, DEFAULT_TUNING, null);
    unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
