// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadSvgAsPng,
  downloadSvgElement,
  serializeSvg,
  toSafeFileStem,
} from './svgExport';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(): SVGSVGElement {
  const element = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  element.setAttribute('viewBox', '0 0 10 10');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M0 0 L10 10');
  element.append(path);
  return element;
}

let created: Blob[] = [];
let downloads: string[] = [];

beforeEach(() => {
  created = [];
  downloads = [];
  let counter = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn((blob: Blob) => {
      created.push(blob);
      counter += 1;
      return `blob:test/${counter}`;
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('toSafeFileStem', () => {
  it('slugifies a caption with interpuncts and accents', () => {
    expect(toSafeFileStem('Spooner · Médallion')).toBe('spooner-medallion');
  });

  it('strips leading and trailing separators and truncates', () => {
    expect(toSafeFileStem('  --- The Gatsby  --- ')).toBe('the-gatsby');
    expect(toSafeFileStem('x'.repeat(120))).toHaveLength(48);
  });

  it('falls back when nothing usable is left', () => {
    expect(toSafeFileStem('···', 'deco-lattice')).toBe('deco-lattice');
  });

  it('has a neutral default fallback, so no feature name leaks into another feature’s file', () => {
    expect(toSafeFileStem('')).toBe('download');
  });
});

describe('serializeSvg', () => {
  it('adds the SVG namespace and an XML declaration', () => {
    const markup = serializeSvg(svg());
    expect(markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(markup).toContain(`xmlns="${SVG_NS}"`);
    expect(markup).toContain('M0 0 L10 10');
  });

  it('declares the namespace exactly once', () => {
    // A namespaced element already carries it through XMLSerializer.
    expect(serializeSvg(svg()).match(/xmlns=/g)).toHaveLength(1);
    // So does one parsed out of an HTML string (jsdom and browsers give it the SVG namespace).
    const parsed = new DOMParser().parseFromString('<svg><path d="M0 0"/></svg>', 'text/html')
      .querySelector('svg') as SVGSVGElement;
    expect(serializeSvg(parsed).match(/xmlns=/g)).toHaveLength(1);
  });

  // The only input the serializer leaves bare, and so the only one that takes the fallback.
  it('adds the namespace once to an element that has none', () => {
    const bare = document.createElementNS(null, 'svg') as unknown as SVGSVGElement;

    const markup = serializeSvg(bare);

    expect(markup).toContain(`<svg xmlns="${SVG_NS}"`);
    expect(markup.match(/xmlns=/g)).toHaveLength(1);
  });

  it('does not mutate the element it serialises', () => {
    const element = svg();
    serializeSvg(element);
    expect(element.getAttributeNames()).not.toContain('xmlns');
  });
});

describe('downloadSvgElement', () => {
  it('hands the user an SVG blob named after the stem', () => {
    downloadSvgElement(svg(), 'deco-lattice');
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('image/svg+xml;charset=utf-8');
    expect(downloads).toEqual(['deco-lattice.svg']);
  });

  it('revokes the object URL afterwards', async () => {
    vi.useFakeTimers();
    downloadSvgElement(svg(), 'frame');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});

describe('downloadSvgAsPng', () => {
  function stubImage(outcome: 'load' | 'error') {
    const OriginalImage = window.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      constructor() {
        queueMicrotask(() => (outcome === 'load' ? this.onload?.() : this.onerror?.()));
      }
    }
    Object.defineProperty(window, 'Image', { writable: true, value: FakeImage });
    return () => Object.defineProperty(window, 'Image', { writable: true, value: OriginalImage });
  }

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
  });

  it('rasterises at the requested size and downloads a PNG', async () => {
    const restore = stubImage('load');
    await downloadSvgAsPng(svg(), 'lattice', 512);
    expect(downloads).toEqual(['lattice.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    restore();
  });

  it('rejects when the browser cannot rasterise', async () => {
    const restore = stubImage('error');
    await expect(downloadSvgAsPng(svg(), 'lattice')).rejects.toThrow('Could not rasterise the image.');
    restore();
  });

  // PR #6 let this pass silently ("skips the download"), so the user clicked Export and
  // nothing happened. It is now an error the caller can show.
  it('rejects, rather than silently doing nothing, when the browser gives no PNG blob', async () => {
    const restore = stubImage('load');
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => {
      callback(null);
    });

    await expect(downloadSvgAsPng(svg(), 'lattice')).rejects.toThrow('The browser could not produce a PNG.');

    expect(downloads).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    restore();
  });

  it('throws when the canvas has no 2D context', async () => {
    const restore = stubImage('load');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(downloadSvgAsPng(svg(), 'lattice')).rejects.toThrow('Canvas is unavailable in this browser.');
    restore();
  });
});
