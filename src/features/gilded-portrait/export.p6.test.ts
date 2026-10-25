// @vitest-environment jsdom
// From PR #6 (cases this branch did not already assert; see ADDENDUM-036).
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type RgbaImage } from './types';

import { setupDomTests } from '@/test/dom';

import { installCanvas2d } from '@/test/canvas2d';

setupDomTests();
const image_p6 = (width = 3, height = 2): RgbaImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(128),
});
describe('downloadGildedPng', () => {
  let click: ReturnType<typeof vi.spyOn>;
  let toBlob: ReturnType<typeof vi.fn>;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    installCanvas2d();
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })));
    HTMLCanvasElement.prototype.toBlob = toBlob as unknown as HTMLCanvasElement['toBlob'];
    createObjectURL = vi.fn(() => 'blob:gilded');
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it('bakes the pixels into a canvas and downloads a PNG', async () => {
    const { downloadGildedPng } = await import('./export');

    await downloadGildedPng(image_p6(), 'Studio Portrait');

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);

    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:gilded');
    expect(anchor.download).toBe('studio-portrait.png');
  });

  it('revokes the object URL a second later', async () => {
    const { downloadGildedPng } = await import('./export');
    const timeout = vi.spyOn(window, 'setTimeout');

    await downloadGildedPng(image_p6());

    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    const callback = timeout.mock.calls[0][0] as () => void;
    callback();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:gilded');
  });

  it('refuses to download when there is no 2D context', async () => {
    const { downloadGildedPng } = await import('./export');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(downloadGildedPng(image_p6())).rejects.toThrow(
      'PNG export is unavailable in this browser.'
    );
  });
});
