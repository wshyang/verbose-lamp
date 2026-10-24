import { afterEach, describe, expect, it, vi } from 'vitest';
import { installImageStub, type ImageStub } from '../../test-utils/imageStub.js';
import {
  IMAGE_LOAD_TIMEOUT_MS,
  isImageBroken,
  isImageDecoded,
  preloadImage,
  resetImagePreload,
} from './imagePreload.js';

/**
 * ADR-143 — the promise this module makes to the hall screen: nothing reports ready until it
 * has actually arrived. Every test here is about the gap between *asked for* and *showable*,
 * because that gap is three metres of broken-image glyph on a wall.
 */

let images: ImageStub;

afterEach(() => {
  images.restore();
  resetImagePreload();
});

describe('preloading an image', () => {
  it('is not ready merely because it was requested', async () => {
    images = installImageStub();
    const ready = preloadImage('/api/gallery/photos/p1/thumb');

    expect(images.requested).toEqual(['/api/gallery/photos/p1/thumb']);
    expect(isImageDecoded('/api/gallery/photos/p1/thumb')).toBe(false);

    images.settleAll();
    await expect(ready).resolves.toBe(true);
    expect(isImageDecoded('/api/gallery/photos/p1/thumb')).toBe(true);
  });

  it('reports a failure rather than leaving the caller waiting forever', async () => {
    images = installImageStub();
    const ready = preloadImage('/api/gallery/photos/gone/thumb');
    images.failAll();

    // A hidden photo, a revoked key, a dead tunnel: all the same answer, and the answer has
    // to arrive — a scene waiting on a promise nobody resolves never comes back to the strip.
    await expect(ready).resolves.toBe(false);
    expect(isImageBroken('/api/gallery/photos/gone/thumb')).toBe(true);
    expect(isImageDecoded('/api/gallery/photos/gone/thumb')).toBe(false);
  });

  it('asks the network once however many scenes want the same photo', async () => {
    images = installImageStub();
    const first = preloadImage('/p/1');
    const second = preloadImage('/p/1');

    expect(images.requested).toHaveLength(1);
    images.settleAll();
    await Promise.all([first, second]);

    // And a later ask is answered from memory, without a request at all: the top-voted scene
    // and the newest scene overlap constantly, and a projector re-pulling both every cycle is
    // precisely the load the gallery's caching exists to avoid.
    await expect(preloadImage('/p/1')).resolves.toBe(true);
    expect(images.requested).toHaveLength(1);
  });

  it('remembers a failure too, so a dead URL is not retried on every cycle', async () => {
    images = installImageStub();
    const first = preloadImage('/p/missing');
    images.failAll();
    await first;

    await expect(preloadImage('/p/missing')).resolves.toBe(false);
    expect(images.requested).toHaveLength(1);
  });

  it('waits for the decode, not merely the load, where the browser offers one', async () => {
    images = installImageStub({ decode: 'resolves' });
    const ready = preloadImage('/p/decoded');
    images.settleAll();

    // `load` only means the bytes are in. `decode` means the bitmap is ready to paint, which
    // is the difference between a slide that moves and a slide that hitches on its first
    // frame — on a projector driven by whatever laptop was in the AV cupboard.
    await expect(ready).resolves.toBe(true);
    expect(isImageDecoded('/p/decoded')).toBe(true);
  });

  /*
   * The defect these two pin was found as an intermittent test failure and turned out to be a
   * live hall-screen fault. A browser does not promise to fire `onload` OR `onerror` — a
   * request can simply hang. The in-flight promise was then never settled and never removed,
   * so EVERY later caller for that URL awaited it forever. Because a scene awaits its batch
   * with `Promise.all`, one hung thumbnail froze the whole wall for the rest of the event.
   */
  it('gives up on an image that never answers, rather than waiting for ever', async () => {
    vi.useFakeTimers();
    try {
      images = installImageStub();
      const ready = preloadImage('/p/hangs');
      // Neither onload nor onerror: the request is simply in limbo.
      await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS);

      await expect(ready).resolves.toBe(false);
      // Not BROKEN: nothing said the image was bad, only that it did not answer in time.
      expect(isImageBroken('/p/hangs')).toBe(false);
      expect(isImageDecoded('/p/hangs')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a later scene retry a URL whose first attempt hung', async () => {
    vi.useFakeTimers();
    try {
      images = installImageStub();
      const first = preloadImage('/p/recovers');
      await vi.advanceTimersByTimeAsync(IMAGE_LOAD_TIMEOUT_MS);
      await first;

      // The second attempt must reach the network again. If the abandoned promise were still
      // in the in-flight map this would await it instead and no request would be made.
      const second = preloadImage('/p/recovers');
      images.settleAll();

      await expect(second).resolves.toBe(true);
      expect(images.requested).toEqual(['/p/recovers', '/p/recovers']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a rejected decode as loaded, because that is what it is', async () => {
    images = installImageStub({ decode: 'rejects' });
    const ready = preloadImage('/p/superseded');
    images.settleAll();

    // `decode()` rejects when it is superseded or the element is detached — neither means
    // the image is bad, and refusing to show it would blank a scene over a technicality.
    await expect(ready).resolves.toBe(true);
  });
});
