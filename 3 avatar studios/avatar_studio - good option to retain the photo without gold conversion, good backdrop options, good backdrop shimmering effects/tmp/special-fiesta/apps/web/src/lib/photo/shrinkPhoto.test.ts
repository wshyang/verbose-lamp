import { GALLERY_RAW_MAX_BYTES } from '@psd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { archiveAttempts, archiveFilenameFor, shrinkForGallery } from './shrinkPhoto.js';

/**
 * ADR-052 — fitting an oversized original under the archive cap.
 *
 * The ladder is tested as data, because the property that matters most is that it TERMINATES: a
 * "progressively shrink until it fits" loop that can spin forever on a file which never fits is the
 * failure worth designing out rather than hoping about.
 *
 * The encode path is then driven through a canvas double, the same way `readPhoto.test.ts` does it,
 * since jsdom has no canvas. What is asserted there is the wiring and the decisions — that quality
 * is spent before resolution, that the first fitting copy stops the ladder, and that
 * `rawIsOriginal` tells the truth either way.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the fitting ladder', () => {
  it('terminates', () => {
    const attempts = archiveAttempts(4000);

    expect(attempts.length).toBeGreaterThan(3);
    expect(attempts.length).toBeLessThan(200);
  });

  it('spends quality at full resolution before touching resolution', () => {
    const attempts = archiveAttempts(4000);

    const fullRes = attempts.filter((attempt) => attempt.scale === 1);
    expect(fullRes.length).toBeGreaterThan(1);
    // Every full-resolution rung comes before the first shrink: an archive should keep its pixels
    // for as long as quality can still pay for the saving.
    expect(attempts.findIndex((attempt) => attempt.scale < 1)).toBe(fullRes.length);
    const qualities = fullRes.map((attempt) => attempt.quality);
    expect(qualities).toEqual([...qualities].sort((left, right) => right - left));
  });

  it('shrinks by 5 % a step, and never below the size we already serve', () => {
    const shrinking = archiveAttempts(4000).filter((attempt) => attempt.scale < 1);

    expect(shrinking[0]?.scale).toBeCloseTo(0.95, 5);
    expect(shrinking[1]?.scale).toBeCloseTo(0.9025, 5);
    // An archive smaller than the 1280 px copy the gallery serves on tap would be worth nothing,
    // so the ladder stops there rather than at some arbitrary fraction.
    const smallestEdge = 4000 * (shrinking[shrinking.length - 1]?.scale ?? 0);
    expect(smallestEdge).toBeGreaterThanOrEqual(1280);
    expect(smallestEdge).toBeLessThan(1280 / 0.95);
  });

  it('offers no shrinking at all when the source is already only as big as we serve', () => {
    // Nothing to gain: any smaller and the archive is beaten by the served rendition.
    expect(archiveAttempts(1280).every((attempt) => attempt.scale === 1)).toBe(true);
  });
});

describe('the lossless rung', () => {
  it('is offered first for an already-lossless source', () => {
    const attempts = archiveAttempts(4000, true);

    // A lossless original often re-encodes smaller AND losslessly, which is a strictly better
    // archive than any lossy copy — so it is worth one attempt before quality is spent.
    expect(attempts[0]).toEqual({ scale: 1, quality: 1, type: 'image/png' });
  });

  it('is skipped for a lossy source, where PNG would only make things worse', () => {
    const attempts = archiveAttempts(4000, false);

    // Measured: a 3.4 MB JPEG becomes a 9.0 MB PNG. The file is already over the cap, so spending a
    // full-resolution encode to make it 2.7x bigger is pure waste.
    expect(attempts.every((attempt) => attempt.type === undefined)).toBe(true);
  });

  it('keeps the PNG extension when the lossless rung is what fit', () => {
    expect(archiveFilenameFor('SCREEN.PNG', 'image/png')).toBe('SCREEN.png');
  });
});

describe('the archive filename', () => {
  it('describes what the file now is, not what it used to be', () => {
    // A .HEIC that is no longer HEIC would mislead every tool Corporate points at the archive.
    expect(archiveFilenameFor('IMG_4242.HEIC', 'image/webp')).toBe('IMG_4242.webp');
    expect(archiveFilenameFor('IMG_4242.HEIC', 'image/jpeg')).toBe('IMG_4242.jpg');
    expect(archiveFilenameFor('holiday.2026.heic', 'image/webp')).toBe('holiday.2026.webp');
    expect(archiveFilenameFor('', 'image/webp')).toBe('photo.webp');
  });
});

/**
 * A canvas whose `toBlob` yields a size we choose, so the ladder's decisions are observable.
 *
 * `sizeFor` governs the ARCHIVE encodes only. The two served renditions are drawn at 1280 px and
 * 256 px and always reported small, because otherwise the rendition cap would reject the photo
 * before the archive ladder ever ran — which is what happened the first time this was written.
 */
function stubCanvas(sizeFor: (quality: number, width: number) => number): number[] {
  const widths: number[] = [];
  const RENDITION_MAX_EDGE = 1280;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    // A rest tuple rather than two named parameters, because `this` counts toward max-params.
    ...rest: [type?: string, quality?: number]
  ) {
    const [type, quality] = rest;
    widths.push(this.width);
    const isRendition = this.width <= RENDITION_MAX_EDGE;
    const size = isRendition ? 20_000 : sizeFor(quality ?? 1, this.width);
    callback({ size, type: type ?? 'image/webp' } as Blob);
  });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })),
  );
  return widths;
}

function oversizedFile(): File {
  const file = new File(['x'], 'IMG_9001.HEIC', { type: 'image/heic' });
  // A File's size is read-only, so it is defined rather than assigned.
  Object.defineProperty(file, 'size', { value: GALLERY_RAW_MAX_BYTES * 3 });
  return file;
}

describe('shrinkForGallery, archiving an oversized original', () => {
  it('passes a file that already fits straight through, untouched', async () => {
    stubCanvas(() => 1_000);
    const file = new File(['x'], 'IMG_1.HEIC', { type: 'image/heic' });
    // Its own size is under the cap, so the ladder is never entered at all.

    const result = await shrinkForGallery(file);

    // The preserve-raw principle still holds for every photo that does not need help.
    expect(result.raw).toBe(file);
    expect(result.filename).toBe('IMG_1.HEIC');
    expect(result.rawIsOriginal).toBe(true);
  });

  it('keeps full resolution when dropping quality alone is enough', async () => {
    // Fits at the second quality rung, still at full size.
    const widths = stubCanvas((quality) =>
      quality >= 0.9 ? GALLERY_RAW_MAX_BYTES * 2 : GALLERY_RAW_MAX_BYTES - 1,
    );

    const result = await shrinkForGallery(oversizedFile());

    expect(result.rawIsOriginal).toBe(false);
    // The archive is a WebP now, and its name says so.
    expect(result.filename).toBe('IMG_9001.webp');
    // No archive rung ever asked for less than the full 4000 px, so no resolution was given up.
    const archiveWidths = widths.filter((width) => width > 1280);
    expect(archiveWidths.every((width) => width === 4000)).toBe(true);
  });

  it('falls back to shrinking only once quality has run out', async () => {
    // Nothing at full resolution fits; only a smaller frame does.
    const widths = stubCanvas((_quality, width) =>
      width >= 4000 ? GALLERY_RAW_MAX_BYTES * 2 : GALLERY_RAW_MAX_BYTES - 1,
    );

    const result = await shrinkForGallery(oversizedFile());

    expect(result.rawIsOriginal).toBe(false);
    // It stopped at the FIRST rung that fit rather than shrinking further than it had to: 5 % off.
    const shrunk = widths.filter((width) => width > 1280 && width < 4000);
    expect(shrunk[0]).toBe(3800);
  });

  it('archives a lossless original losslessly when PNG fits', async () => {
    // PNG fits; the WebP rungs would also have fit, but lossless is the better archive so the
    // ladder must reach for it first.
    const widths = stubCanvas(() => GALLERY_RAW_MAX_BYTES - 1);
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], 'SHOT.PNG', {
      type: 'image/png',
    });
    Object.defineProperty(png, 'size', { value: GALLERY_RAW_MAX_BYTES * 2 });

    const result = await shrinkForGallery(png);

    expect(result.rawIsOriginal).toBe(false);
    expect(result.filename).toBe('SHOT.png');
    expect(result.raw.type).toBe('image/png');
    // Full resolution, because the very first rung fit.
    expect(widths.filter((width) => width > 1280).every((width) => width === 4000)).toBe(true);
  });

  it('refuses only after the whole ladder has been tried', async () => {
    stubCanvas(() => GALLERY_RAW_MAX_BYTES * 2);

    // An honest refusal, and a different thing from refusing up front: everything was attempted.
    await expect(shrinkForGallery(oversizedFile())).rejects.toThrow(/too large to archive/i);
  });
});
