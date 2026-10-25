// @vitest-environment jsdom
// From PR #3 (cases this branch did not already assert; see ADDENDUM-036).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useQrGenerator } from './useQrGenerator';
import { QR_PRESETS } from './presets';

const io = vi.hoisted(() => ({ downloadSvgElement: vi.fn(), downloadSvgAsPng: vi.fn() }));
vi.mock('./export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./export')>();
  return { ...actual, downloadSvgElement: io.downloadSvgElement, downloadSvgAsPng: io.downloadSvgAsPng };
});
const [INITIAL] = QR_PRESETS;
afterEach(() => {
  vi.clearAllMocks();
});
describe('useQrGenerator', () => {
  it('opens on the first invitation with a render plan and a summary', () => {
    const { result } = renderHook(() => useQrGenerator());
    expect(result.current.text).toBe(INITIAL.text);
    expect(result.current.caption).toBe(INITIAL.caption);
    expect(result.current.errorCorrection).toBe(INITIAL.errorCorrection);
    expect(result.current.shape).toBe('plaque');
    expect(result.current.activePresetId).toBe(INITIAL.id);
    expect(result.current.plan).not.toBeNull();
    expect(result.current.summary).toEqual({
      version: result.current.plan?.version,
      size: result.current.plan?.size,
      byteCount: new TextEncoder().encode(INITIAL.text).length,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isShimmering).toBe(true);
    expect(result.current.isExporting).toBe(false);
  });

  it('reports encoding errors and drops the plan and summary', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setText('x'.repeat(6000)));
    expect(result.current.plan).toBeNull();
    expect(result.current.summary).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.activePresetId).toBeNull();
  });

  it('matches a preset only while text and correction still agree', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setErrorCorrection('H'));
    expect(result.current.activePresetId).toBeNull();

    act(() => result.current.applyPreset(QR_PRESETS[1]));
    expect(result.current.text).toBe(QR_PRESETS[1].text);
    expect(result.current.caption).toBe(QR_PRESETS[1].caption);
    expect(result.current.errorCorrection).toBe(QR_PRESETS[1].errorCorrection);
    expect(result.current.activePresetId).toBe(QR_PRESETS[1].id);
  });

  it('downloads the SVG using a caption-derived file stem', () => {
    const { result } = renderHook(() => useQrGenerator());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (result.current.svgRef as { current: SVGSVGElement | null }).current = svg;
    act(() => result.current.downloadSvg());
    expect(io.downloadSvgElement).toHaveBeenCalledWith(svg, 'admit-one-west-egg');
  });

  it('does nothing without a mounted SVG', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.downloadSvg());
    expect(io.downloadSvgElement).not.toHaveBeenCalled();
  });

  it('engraves a PNG and resets the busy flag', async () => {
    io.downloadSvgAsPng.mockResolvedValue(undefined);
    const { result } = renderHook(() => useQrGenerator());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    (result.current.svgRef as { current: SVGSVGElement | null }).current = svg;

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.downloadPng();
    });
    expect(result.current.isExporting).toBe(true);
    await act(async () => {
      await pending;
    });
    expect(io.downloadSvgAsPng).toHaveBeenCalledWith(svg, 'admit-one-west-egg');
    expect(result.current.isExporting).toBe(false);
  });

  it('ignores a PNG request while one is running or without an SVG', async () => {
    const { result } = renderHook(() => useQrGenerator());
    await act(async () => {
      await result.current.downloadPng();
    });
    expect(io.downloadSvgAsPng).not.toHaveBeenCalled();
  });
});
