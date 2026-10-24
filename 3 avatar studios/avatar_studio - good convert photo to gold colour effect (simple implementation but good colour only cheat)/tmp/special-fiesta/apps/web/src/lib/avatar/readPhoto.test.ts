import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAvatarSprite } from '@psd/contracts';
import { detectFaceBox, photoFileToSprite } from './readPhoto.js';

/**
 * ADR-031 — the browser half: decode, draw, read back. jsdom has no canvas, so the canvas
 * is a double that hands over a bitmap we control; what is asserted is the wiring and the
 * failure path, which is the part a user meets when a photo will not decode.
 */

const COLOURS = { backdrop: '#1d5b8c', ink: '#12243a' };

function fakeCanvas(pixels: Uint8ClampedArray, size: number) {
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels, width: size, height: size })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

function portraitPixels(size: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const face = ((x - size / 2) / (size * 0.28)) ** 2 + ((y - size * 0.45) / (size * 0.32)) ** 2 <= 1;
      const at = (y * size + x) * 4;
      pixels[at] = face ? 224 : 232;
      pixels[at + 1] = face ? 168 : 232;
      pixels[at + 2] = face ? 120 : 232;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('photoFileToSprite', () => {
  it('turns the chosen file into a sprite without uploading anything', async () => {
    const size = 160;
    fakeCanvas(portraitPixels(size), size);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: size, height: size, close: vi.fn() })));

    const { sprite, bitmap } = await photoFileToSprite(new Blob(['photo']), COLOURS);

    expect(parseAvatarSprite(sprite)).not.toBeNull();
    // The only thing that ever leaves this function is the sprite string…
    expect(sprite.startsWith('128:')).toBe(true);
    // …and the decoded pixels, kept in memory so the model can have a go at them.
    expect(bitmap.width).toBe(size);
  });

  it('scales a large photo down to the working size before reading it', async () => {
    // The double hands back a bitmap of the scaled size the adapter asked for.
    const context = fakeCanvas(portraitPixels(640), 640);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));

    await photoFileToSprite(new Blob(['photo']), COLOURS);

    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 480);
  });

  it('says so when the file is not an image it can read', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new Error('not an image');
    }));

    await expect(photoFileToSprite(new Blob(['nope']), COLOURS)).rejects.toThrow(/could not be turned/);
  });

  it('says so when the browser will not give us a canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 64, height: 64, close: vi.fn() })));

    await expect(photoFileToSprite(new Blob(['photo']), COLOURS)).rejects.toThrow(/could not be turned/);
  });

  it('uses the browser face detector when there is one (ADR-034)', async () => {
    const size = 160;
    fakeCanvas(portraitPixels(size), size);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: size, height: size, close: vi.fn() })));
    const detect = vi.fn(async () => [{ boundingBox: { x: 40, y: 30, width: 60, height: 70 } }]);
    vi.stubGlobal('FaceDetector', vi.fn(() => ({ detect })));

    const { crop } = await photoFileToSprite(new Blob(['photo']), COLOURS);

    expect(detect).toHaveBeenCalled();
    // The box is a face; the crop is the head around it, centred on the same middle.
    expect(crop).not.toBeNull();
    expect(Math.abs((crop?.x ?? 0) + (crop?.size ?? 0) / 2 - 70)).toBeLessThan(6);
    expect(crop?.size).toBeGreaterThan(70);
  });

  it('shrugs when the detector is missing or unhappy', async () => {
    const bitmap = { width: 64, height: 64, pixels: portraitPixels(64) };

    // No Shape Detection API at all — Safari, Firefox, most of the world.
    expect(await detectFaceBox(new Blob(['photo']), bitmap)).toBeNull();

    // Present but finds nothing, or throws: both are "no box", never an error.
    vi.stubGlobal('FaceDetector', vi.fn(() => ({ detect: vi.fn(async () => []) })));
    expect(await detectFaceBox(new Blob(['photo']), bitmap)).toBeNull();
    vi.stubGlobal('FaceDetector', vi.fn(() => ({
      detect: vi.fn(async () => {
        throw new Error('no camera permission');
      }),
    })));
    expect(await detectFaceBox(new Blob(['photo']), bitmap)).toBeNull();
  });
});
