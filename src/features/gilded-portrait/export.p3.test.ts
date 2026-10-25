// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from './types';

import { downloadGildedPng } from './export';

function image(width = 2, height = 2): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(180);
  return { width, height, data };
}
let clickSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  clickSpy = vi.fn();
  HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:gilded'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob([`${this.width}x${this.height}`], { type: 'image/png' }));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('downloadGildedPng', () => {
  it('paints the pixels, encodes a PNG and clicks a download anchor', async () => {
    await downloadGildedPng(image(4, 3), 'daisy.png');

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('daisy.png');
    expect(anchor.href).toBe('blob:gilded');
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:gilded');
  });

  it('falls back to a safe file stem for unusable labels', async () => {
    await downloadGildedPng(image(), '   ');
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('gilded-portrait.png');
  });

  it('throws when the canvas cannot encode', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
      callback(null),
    );
    await expect(downloadGildedPng(image())).rejects.toThrow('PNG export is unavailable');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('throws when no 2D context is available', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(downloadGildedPng(image())).rejects.toThrow('PNG export is unavailable');
  });
});
