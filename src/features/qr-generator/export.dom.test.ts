// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadSvgAsPng,
  downloadSvgElement,
  serializeSvg,
  toSafeFileStem,
} from './export';

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  svg.appendChild(rect);
  return svg;
}

/** A real <img> element whose `src` fires the load (or error) handler on the next tick. */
function stubImage(isLoadable = true) {
  vi.stubGlobal(
    'Image',
    function FakeImageCtor(this: HTMLImageElement) {
      const image = document.createElement('img');
      Object.defineProperty(image, 'src', {
        configurable: true,
        set() {
          queueMicrotask(() => {
            if (isLoadable) image.onload?.(new Event('load'));
            else image.onerror?.(new Event('error'));
          });
        },
      });
      return image;
    } as unknown as new () => HTMLImageElement,
  );
}

let clickSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clickSpy = vi.fn();
  HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:svg'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
    callback(new Blob(['png'], { type: 'image/png' })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('serializeSvg', () => {
  it('adds the SVG namespace and an XML declaration', () => {
    const markup = serializeSvg(makeSvg());
    expect(markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('<rect');
  });

  it('keeps an existing namespace and does not mutate the source', () => {
    const svg = makeSvg();
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const markup = serializeSvg(svg);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.childNodes).toHaveLength(1);
  });
});

describe('downloadSvgElement', () => {
  it('clicks a download anchor and revokes the URL a second later', () => {
    vi.useFakeTimers();
    downloadSvgElement(makeSvg(), 'admit-one');
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('admit-one.svg');
    expect(anchor.href).toBe('blob:svg');
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });
});

describe('downloadSvgAsPng', () => {
  it('rasterises the SVG through an image and a canvas', async () => {
    stubImage();
    await downloadSvgAsPng(makeSvg(), 'admit-one', 256);

    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('admit-one.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });

  it('rejects when the image cannot be loaded', async () => {
    stubImage(false);
    await expect(downloadSvgAsPng(makeSvg(), 'broken')).rejects.toThrow('Could not rasterise');
    expect(clickSpy).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });

  it('skips the download when encoding returns nothing', async () => {
    stubImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
      callback(null),
    );
    await downloadSvgAsPng(makeSvg(), 'empty');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  // Last in the file: restoring a `getContext` stub also drops the canvas mock for later tests.
  it('throws when the canvas has no context', async () => {
    stubImage();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(downloadSvgAsPng(makeSvg(), 'broken')).rejects.toThrow('Canvas is unavailable');
  });
});

describe('toSafeFileStem', () => {
  it('still slugifies captions', () => {
    expect(toSafeFileStem('ADMIT ONE · WEST EGG')).toBe('admit-one-west-egg');
  });
});
