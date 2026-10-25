// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The browser download is doubled at the export seam; what is under test is the hook's own
// behaviour around it: the file stem, the busy flag, and what happens when an export fails.
const exporter = vi.hoisted(() => ({
  downloadSvgElement: vi.fn(),
  downloadSvgAsPng: vi.fn<(svg: SVGSVGElement, stem: string) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('./export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export')>()),
  downloadSvgElement: exporter.downloadSvgElement,
  downloadSvgAsPng: exporter.downloadSvgAsPng,
}));

import { useQrGenerator } from './useQrGenerator';

afterEach(() => {
  exporter.downloadSvgElement.mockClear();
  exporter.downloadSvgAsPng.mockReset();
  exporter.downloadSvgAsPng.mockImplementation(() => Promise.resolve());
});

function generatorWithSvg() {
  const view = renderHook(() => useQrGenerator());
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  act(() => {
    (view.result.current.svgRef as { current: SVGSVGElement | null }).current = svg;
  });
  return { ...view, svg };
}

describe('useQrGenerator exports', () => {
  it('downloads the SVG named after the caption', () => {
    const { result, svg } = generatorWithSvg();
    act(() => result.current.setCaption('Admit One'));

    act(() => result.current.downloadSvg());

    expect(exporter.downloadSvgElement).toHaveBeenCalledWith(svg, 'admit-one');
  });

  it('keeps the QR file name when the caption has nothing printable', () => {
    const { result } = generatorWithSvg();
    act(() => result.current.setCaption('✦ ✦'));

    act(() => result.current.downloadSvg());

    expect(exporter.downloadSvgElement.mock.calls[0][1]).toBe('golden-qr');
  });

  it('does nothing before the preview has mounted', async () => {
    const { result } = renderHook(() => useQrGenerator());

    act(() => result.current.downloadSvg());
    await act(() => result.current.downloadPng());

    expect(exporter.downloadSvgElement).not.toHaveBeenCalled();
    expect(exporter.downloadSvgAsPng).not.toHaveBeenCalled();
  });

  it('is busy while a PNG is being made and free afterwards', async () => {
    let finish: () => void = () => {};
    exporter.downloadSvgAsPng.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = generatorWithSvg();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isExporting).toBe(false);
  });

  it('ignores a second PNG request while one is running', async () => {
    let finish: () => void = () => {};
    exporter.downloadSvgAsPng.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = generatorWithSvg();

    act(() => {
      void result.current.downloadPng();
    });
    await act(() => result.current.downloadPng());

    expect(exporter.downloadSvgAsPng).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  // downloadSvgAsPng now rejects when the browser cannot make a PNG; the button is wired as
  // `void qr.downloadPng()`, so a rejection that escaped here would be an unhandled promise
  // and the user would see nothing.
  it('reports a failed PNG export instead of leaking a rejection', async () => {
    exporter.downloadSvgAsPng.mockRejectedValue(new Error('The browser could not produce a PNG.'));
    const { result } = generatorWithSvg();

    await act(() => result.current.downloadPng());

    expect(result.current.exportError).toBe('The browser could not produce a PNG.');
    expect(result.current.isExporting).toBe(false);
  });

  it('clears the export error once the next export is tried', async () => {
    exporter.downloadSvgAsPng.mockRejectedValueOnce(new Error('boom'));
    const { result } = generatorWithSvg();
    await act(() => result.current.downloadPng());
    expect(result.current.exportError).toBe('boom');

    await act(() => result.current.downloadPng());

    expect(result.current.exportError).toBeNull();
  });
});
