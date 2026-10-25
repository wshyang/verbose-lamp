// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_QR_CAPTION_LENGTH, QR_PRESETS } from './presets';
import { useQrGenerator } from './useQrGenerator';

const slugify = (value: string) => value.toLowerCase().split(' ').join('-');

const exportsMock = vi.hoisted(() => {
  const slug = (value: string) => value.toLowerCase().split(' ').join('-');
  return {
    downloadSvgElement: vi.fn(),
    downloadSvgAsPng: vi.fn(() => Promise.resolve()),
    toSafeFileStem: vi.fn(slug),
  };
});

vi.mock('./export', () => exportsMock);

beforeEach(() => {
  vi.clearAllMocks();
  exportsMock.downloadSvgAsPng.mockResolvedValue(undefined);
  exportsMock.toSafeFileStem.mockImplementation(slugify);
});

describe('useQrGenerator', () => {
  it('starts on the first preset and derives a plan and byte summary', () => {
    const { result } = renderHook(() => useQrGenerator());
    expect(result.current.text).toBe(QR_PRESETS[0].text);
    expect(result.current.activePresetId).toBe(QR_PRESETS[0].id);
    expect(result.current.error).toBeNull();
    expect(result.current.plan).toBeTruthy();
    expect(result.current.summary?.byteCount).toBe(new TextEncoder().encode(result.current.text).length);
  });

  it('updates every control, applies presets, and clears the active preset on edits', () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.setText('https://example.com/party'));
    act(() => result.current.setCaption('x'.repeat(MAX_QR_CAPTION_LENGTH + 5)));
    act(() => result.current.setErrorCorrection('L'));
    act(() => result.current.setShape('diamond'));
    act(() => result.current.setShimmering(false));
    expect(result.current.caption).toHaveLength(MAX_QR_CAPTION_LENGTH);
    expect(result.current.activePresetId).toBeNull();
    expect(result.current).toMatchObject({ shape: 'diamond', isShimmering: false });
    const preset = QR_PRESETS[1] ?? QR_PRESETS[0];
    act(() => result.current.applyPreset(preset));
    expect(result.current).toMatchObject({
      text: preset.text, caption: preset.caption, errorCorrection: preset.errorCorrection, activePresetId: preset.id,
    });
  });

  it('guards downloads without an SVG and forwards safe stems when present', async () => {
    const { result } = renderHook(() => useQrGenerator());
    act(() => result.current.downloadSvg());
    await act(async () => result.current.downloadPng());
    expect(exportsMock.downloadSvgElement).not.toHaveBeenCalled();
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    result.current.svgRef.current = element;
    act(() => result.current.setCaption('My Party'));
    act(() => result.current.downloadSvg());
    expect(exportsMock.downloadSvgElement).toHaveBeenCalledWith(element, 'my-party');
    await act(async () => result.current.downloadPng());
    expect(exportsMock.downloadSvgAsPng).toHaveBeenCalledWith(element, 'my-party');
    expect(result.current.isExporting).toBe(false);
  });
});
