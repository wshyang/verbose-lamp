// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSvgAsPng, downloadSvgElement, serializeSvg } from './export';

let imageMode: 'load' | 'error' = 'load';
let context: object | null;
let pngBlob: Blob | null;
const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => (imageMode === 'load' ? this.onload?.() : this.onerror?.()));
  }
}

function svg(xmlns = false): SVGSVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  if (xmlns) element.setAttribute('xmlns', 'preset');
  return element;
}

beforeEach(() => {
  imageMode = 'load';
  context = ctx;
  pngBlob = new Blob(['png']);
  vi.stubGlobal('Image', MockImage);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:qr'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const originalCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return originalCreate(tag);
    return {
      width: 0, height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(pngBlob)),
    };
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('QR SVG export DOM wrappers', () => {
  it('adds xmlns only when missing', () => {
    expect(serializeSvg(svg())).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(serializeSvg(svg(true))).toContain('xmlns="preset"');
  });

  it('downloads SVG through an object URL and revokes after one second', () => {
    vi.useFakeTimers();
    downloadSvgElement(svg(), 'party');
    const anchor = document.createElement('a');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(anchor).toBeTruthy();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr');
  });

  it('rasterises to PNG at the requested size', async () => {
    vi.useFakeTimers();
    await downloadSvgAsPng(svg(), 'party', 64);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 64, 64);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 64, 64);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr');
  });

  it('uses the default PNG size and skips download when canvas returns no blob', async () => {
    pngBlob = null;
    await downloadSvgAsPng(svg(), 'party');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1024, 1024);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('rejects image and canvas failures while revoking the SVG URL', async () => {
    imageMode = 'error';
    await expect(downloadSvgAsPng(svg(), 'bad')).rejects.toThrow('Could not rasterise');
    imageMode = 'load';
    context = null;
    await expect(downloadSvgAsPng(svg(), 'bad')).rejects.toThrow('Canvas is unavailable');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
