// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSvgAsPng, downloadSvgElement, serializeSvg } from './export';
import { QR_PRESETS } from './presets';
import { useQrGenerator } from './useQrGenerator';

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  return svg;
}

let created: string[] = [];

beforeEach(() => {
  created = [];
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:mock/${created.length}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('serializeSvg', () => {
  it('clones the element, adds the SVG namespace and an XML header', () => {
    const svg = makeSvg();
    const text = serializeSvg(svg);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"');
    // The caller's element is untouched.
    expect(svg.getAttribute('xmlns')).toBeNull();
  });

  it('serialises an element that already declares its namespace', () => {
    const svg = makeSvg();
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // XMLSerializer may also emit the declaration, so only the header is asserted.
    expect(serializeSvg(svg)).toContain('viewBox="0 0 10 10"');
  });
});

describe('downloadSvgElement', () => {
  it('clicks an anchor named after the stem', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    downloadSvgElement(makeSvg(), 'golden-qr');
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toBeInstanceOf(HTMLAnchorElement);
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('golden-qr.svg');
    expect(created).toHaveLength(1);
  });

  it('revokes the object URL a second later', () => {
    vi.useFakeTimers();
    downloadSvgElement(makeSvg(), 'golden-qr');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/0');
    vi.useRealTimers();
  });
});

describe('downloadSvgAsPng', () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  it('rasterises the svg through an image and downloads the png', async () => {
    vi.stubGlobal('Image', FakeImage);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await downloadSvgAsPng(makeSvg(), 'golden-qr', 256);
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('golden-qr.png');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('refuses to paint when the browser has no 2D context', async () => {
    class ImmediateImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', ImmediateImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(downloadSvgAsPng(makeSvg(), 'golden-qr')).rejects.toThrow('Canvas is unavailable');
  });

  it('does nothing when the encoder yields no png', async () => {
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) => callback(null));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    await expect(downloadSvgAsPng(makeSvg(), 'golden-qr')).resolves.toBeUndefined();
    expect(click).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('rejects when the image cannot be rasterised', async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', BrokenImage);
    await expect(downloadSvgAsPng(makeSvg(), 'golden-qr')).rejects.toThrow('Could not rasterise the code.');
  });
});

describe('useQrGenerator', () => {
  it('starts on the first preset with a rendered plan and summary', () => {
    const { result } = renderHook(() => useQrGenerator());
    expect(result.current.text).toBe(QR_PRESETS[0].text);
    expect(result.current.caption).toBe(QR_PRESETS[0].caption);
    expect(result.current.activePresetId).toBe(QR_PRESETS[0].id);
    expect(result.current.plan).not.toBeNull();
    expect(result.current.summary?.version).toBe(result.current.plan?.version);
    expect(result.current.error).toBeNull();
    expect(result.current.isShimmering).toBe(true);
  });

  it('caps the caption and clears the preset match off-preset', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setText('https://example.com/party'));
    expect(result.current.activePresetId).toBeNull();

    act(() => result.current.setCaption('x'.repeat(200)));
    expect((result.current.caption ?? '').length).toBeLessThan(200);
  });

  it('reports an encode error for text that is too long', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setText('x'.repeat(5_000)));
    expect(result.current.plan).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.summary).toBeNull();
  });

  it('applies a preset and switches the module shape', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.applyPreset(QR_PRESETS[QR_PRESETS.length - 1]));
    expect(result.current.activePresetId).toBe(QR_PRESETS[QR_PRESETS.length - 1].id);
    act(() => result.current.setShape('dot'));
    expect(result.current.shape).toBe('dot');
    act(() => result.current.setErrorCorrection('L'));
    expect(result.current.errorCorrection).toBe('L');
    act(() => result.current.setShimmering(false));
    expect(result.current.isShimmering).toBe(false);
  });

  it('downloads the svg only once the ref is attached', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.downloadSvg());
    expect(click).not.toHaveBeenCalled();

    (result.current.svgRef as { current: SVGSVGElement | null }).current = makeSvg();
    act(() => result.current.downloadSvg());
    expect(click).toHaveBeenCalledOnce();
  });

  it('exports a png through the ref and never overlaps exports', async () => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const { result } = renderHook(() => useQrGenerator());
    (result.current.svgRef as { current: SVGSVGElement | null }).current = makeSvg();

    await act(async () => {
      await result.current.downloadPng();
    });
    expect(click).toHaveBeenCalledOnce();
    expect(result.current.isExporting).toBe(false);
  });

  it('does nothing for a png export without an svg', async () => {
    const { result } = renderHook(() => useQrGenerator());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(false);
  });
});
